import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { NotifService } from "../../common/services/notif.service";
import { ChatGateway } from "../../sockets/chat.gateway";
import { AuthService } from "../auth/auth.service";
import { StorageService } from "../../storage/storage.service";
import { UploadService } from "../../common/services/upload.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { CommentaireDto } from "./dto/commentaire.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";

const USER_SELECT = {
  id: true,
  prenom: true,
  nom: true,
  photo_file_path: true,
} as const;

/**
 * Auteur + sa villa courante **dans la cité du post consulté** (un utilisateur
 * multi-cités peut avoir une villa différente selon la cité).
 */
const userSelect = (citeId: string) =>
  ({
    ...USER_SELECT,
    user_villa: {
      where: {
        is_current: true,
        is_deleted: false,
        revoked_at: null,
        cite_id: citeId,
      },
      take: 1,
      select: {
        villa: { select: { numero: true, rue: true, is_deleted: true } },
      },
    },
  }) as const;

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "video/3gpp": "3gp",
  "video/ogg": "ogv",
  "video/mpeg": "mpeg",
  "video/mp2t": "ts",
};

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const DEFAULT_VIDEO_MAX_MO = 50;
const DEFAULT_PHOTOS_MAX = 3;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_COMMENTS_PAGE_SIZE = 20;
const PREVIEW_COMMENTS = 2;

type MediaKind = "IMAGE" | "VIDEO";
type DerivedMediaType = "TEXT" | "PHOTO" | "VIDEO";

interface ClassifiedFile {
  file: Express.Multer.File;
  kind: MediaKind;
}

export interface MediaMetaInput {
  largeur: number | null;
  hauteur: number | null;
  duree_sec: number | null;
}

export interface AuthorVillaDto {
  numero: string;
  rue: string | null;
}

export interface AuthorDto {
  id: string;
  prenom: string;
  nom: string;
  photo_url: string | null;
  villa: AuthorVillaDto | null;
}

export interface AuthorRow {
  id: string;
  prenom: string;
  nom: string;
  photo_file_path?: string | null;
  user_villa?: {
    villa: { numero: string; rue: string | null; is_deleted: boolean | null } | null;
  }[] | null;
}

export interface MediaRow {
  id: string;
  type: string;
  file_path: string;
  mime_type: string;
  taille_ko: number | null;
  ordre: number;
  largeur: number | null;
  hauteur: number | null;
  duree_sec: number | null;
}

export interface CommentRow {
  id: string;
  post_id: string;
  parent_id?: string | null;
  niveau: number;
  texte: string;
  created_at?: Date | null;
  user?: AuthorRow | null;
}

export interface PostRow {
  id: string;
  cite_id: string;
  auteur_id: string;
  contenu: string | null;
  likes_count: number;
  commentaires_count: number;
  created_at?: Date | null;
  updated_at?: Date | null;
  user?: AuthorRow | null;
  feed_post_media?: MediaRow[];
}

type AuthorCache = Map<string, AuthorDto>;

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotifService,
    private readonly chat: ChatGateway,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
    private readonly upload: UploadService,
  ) {}

  private async configValue(key: string, def: string): Promise<string> {
    const row = await this.prisma.app_config.findUnique({ where: { key } });
    return row?.value ?? def;
  }

  private async presignTtl(): Promise<number> {
    return (
      Number(
        await this.configValue("MINIO_PRESIGNED_URL_TTL_SEC", "3600"),
      ) || 3600
    );
  }

  private classify(file: Express.Multer.File): MediaKind | null {
    if (file.mimetype?.startsWith("image/")) return "IMAGE";
    if (file.mimetype?.startsWith("video/")) return "VIDEO";
    return null;
  }

  private extFor(file: Express.Multer.File, kind: MediaKind): string {
    if (kind === "IMAGE") {
      const ext = IMAGE_MIME_TO_EXT[file.mimetype];
      if (!ext) {
        throw new BadRequestException(
          `Format d'image non supporté : ${file.mimetype} (jpg, png, webp)`,
        );
      }
      return ext;
    }
    const known = VIDEO_MIME_TO_EXT[file.mimetype];
    if (known) return known;
    const subtype = (file.mimetype.split("/")[1] ?? "").replace(
      /[^a-z0-9]/gi,
      "",
    );
    if (subtype) return subtype.slice(0, 10);
    const fromName = path
      .extname(file.originalname ?? "")
      .replace(".", "")
      .replace(/[^a-z0-9]/gi, "");
    return fromName ? fromName.slice(0, 10) : "bin";
  }

  private deriveMediaType(media: { type: string }[]): DerivedMediaType {
    if (media.some((m) => m.type === "VIDEO")) return "VIDEO";
    if (media.some((m) => m.type === "IMAGE")) return "PHOTO";
    return "TEXT";
  }

  /**
   * Parse le champ multipart `media_meta` (JSON array aligné sur `media[]`).
   * Tolérant : entrée invalide → tableau vide (les colonnes restent null).
   */
  private parseMediaMeta(
    raw: string | undefined,
    count: number,
  ): MediaMetaInput[] {
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const toDim = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) && v > 0
        ? Math.min(Math.round(v), 100000)
        : null;
    return parsed.slice(0, count).map((m) => {
      const obj = (m ?? {}) as Record<string, unknown>;
      return {
        largeur: toDim(obj.largeur),
        hauteur: toDim(obj.hauteur),
        duree_sec: toDim(obj.duree_sec),
      };
    });
  }

  /** Sérialise un auteur en DTO public avec `photo_url` pré-signée (cache par requête). */
  private async authorWithUrl(
    author: AuthorRow | null,
    bucket: string,
    ttl: number,
    cache?: AuthorCache,
  ): Promise<AuthorDto | null> {
    if (!author) return null;
    const cached = cache?.get(author.id);
    if (cached) return cached;
    const photo_url = author.photo_file_path
      ? await this.storage
          .getPresignedUrl(bucket, author.photo_file_path, ttl)
          .catch(() => null)
      : null;
    const uv = author.user_villa?.find((v) => v.villa && !v.villa.is_deleted);
    const dto: AuthorDto = {
      id: author.id,
      prenom: author.prenom,
      nom: author.nom,
      photo_url,
      villa: uv?.villa
        ? { numero: uv.villa.numero, rue: uv.villa.rue ?? null }
        : null,
    };
    cache?.set(author.id, dto);
    return dto;
  }

  private async withMediaUrls<
    T extends {
      id: string;
      type: string;
      file_path: string;
      mime_type: string;
      taille_ko: number | null;
      ordre: number;
      largeur: number | null;
      hauteur: number | null;
      duree_sec: number | null;
    },
  >(media: T[], bucket: string, ttl: number) {
    return Promise.all(
      media.map(async (m) => ({
        id: m.id,
        type: m.type,
        file_path: m.file_path,
        mime_type: m.mime_type,
        taille_ko: m.taille_ko,
        ordre: m.ordre,
        largeur: m.largeur,
        hauteur: m.hauteur,
        duree_sec: m.duree_sec,
        url: await this.storage
          .getPresignedUrl(bucket, m.file_path, ttl)
          .catch(() => null),
      })),
    );
  }

  private async toCommentBase(
    c: CommentRow,
    bucket: string,
    ttl: number,
    cache?: AuthorCache,
  ) {
    return {
      id: c.id,
      post_id: c.post_id,
      parent_id: c.parent_id ?? null,
      niveau: c.niveau,
      texte: c.texte,
      auteur: await this.authorWithUrl(c.user ?? null, bucket, ttl, cache),
      created_at: c.created_at ?? null,
    };
  }

  private async toCommentNode(
    c: CommentRow,
    bucket: string,
    ttl: number,
    replies: CommentRow[],
    cache?: AuthorCache,
  ) {
    return {
      ...(await this.toCommentBase(c, bucket, ttl, cache)),
      reponses: await Promise.all(
        replies.map((r) => this.toCommentBase(r, bucket, ttl, cache)),
      ),
    };
  }

  private async toPostDto(
    post: PostRow,
    bucket: string,
    ttl: number,
    likedByMe: boolean,
    preview: CommentRow[] = [],
    cache?: AuthorCache,
  ) {
    const media = post.feed_post_media ?? [];
    return {
      id: post.id,
      cite_id: post.cite_id,
      auteur_id: post.auteur_id,
      auteur: await this.authorWithUrl(post.user ?? null, bucket, ttl, cache),
      contenu: post.contenu,
      media_type: this.deriveMediaType(media),
      media: await this.withMediaUrls(media, bucket, ttl),
      likes_count: post.likes_count,
      liked_by_me: likedByMe,
      commentaires_count: post.commentaires_count,
      commentaires_preview: await Promise.all(
        preview.map((c) => this.toCommentBase(c, bucket, ttl, cache)),
      ),
      created_at: post.created_at ?? null,
      updated_at: post.updated_at ?? null,
    };
  }

  private async getPostOrThrow(id: string, citeId: string) {
    const post = await this.prisma.feed_post.findFirst({
      where: { id, cite_id: citeId, is_deleted: false },
    });
    if (!post) throw new NotFoundException("Post introuvable");
    return post;
  }

  async create(
    citeId: string,
    userId: string,
    dto: CreatePostDto,
    files: Express.Multer.File[],
  ) {
    const all = (files ?? []).filter((f) => f && f.size > 0);
    try {
      const contenu = dto.contenu?.trim() ? dto.contenu.trim() : null;

      if (!contenu && all.length === 0) {
        throw new BadRequestException(
          "Post vide : ajoutez un texte ou un média",
        );
      }

      const videoMaxMo =
        Number(
          await this.configValue(
            "FEED_VIDEO_MAX_MO",
            String(DEFAULT_VIDEO_MAX_MO),
          ),
        ) || DEFAULT_VIDEO_MAX_MO;
      const photosMax =
        Number(
          await this.configValue("FEED_PHOTOS_MAX", String(DEFAULT_PHOTOS_MAX)),
        ) || DEFAULT_PHOTOS_MAX;

      const classified: ClassifiedFile[] = all.map((file) => {
        const kind = this.classify(file);
        if (!kind) {
          throw new BadRequestException(
            `Type de média non supporté : ${file.mimetype}`,
          );
        }
        return { file, kind };
      });

      const images = classified.filter((c) => c.kind === "IMAGE");
      const videos = classified.filter((c) => c.kind === "VIDEO");

      if (images.length > 0 && videos.length > 0) {
        throw new BadRequestException(
          "Un post ne peut pas mélanger photos et vidéo",
        );
      }
      if (images.length > photosMax) {
        throw new BadRequestException(`Maximum ${photosMax} photos par post`);
      }
      if (videos.length > 1) {
        throw new BadRequestException("Une seule vidéo par post");
      }
      for (const { file, kind } of classified) {
        if (kind === "IMAGE" && file.size > MAX_IMAGE_SIZE) {
          throw new BadRequestException("Image trop volumineuse (max 8 Mo)");
        }
        if (kind === "VIDEO" && file.size > videoMaxMo * 1024 * 1024) {
          throw new BadRequestException(
            `Vidéo trop volumineuse (max ${videoMaxMo} Mo)`,
          );
        }
      }

      const meta = this.parseMediaMeta(dto.media_meta, classified.length);

      const bucket = await this.upload.bucket();
        await this.storage.ensureBucket(bucket);
        const ttl = await this.presignTtl();

        const stored = await Promise.all(
          classified.map(async ({ file, kind }, index) => {
            const ext = this.extFor(file, kind);
            const objectName = `feed/${citeId}/${randomUUID()}.${ext}`;
            await this.storage.uploadStream(
              bucket,
              objectName,
              fs.createReadStream(file.path),
              file.mimetype,
              file.size,
            );
            const dims = meta[index];
            return {
              type: kind,
              file_path: objectName,
              mime_type: file.mimetype,
              taille_ko: Math.round(file.size / 1024),
              ordre: index + 1,
              largeur: dims?.largeur ?? null,
              hauteur: dims?.hauteur ?? null,
              duree_sec: dims?.duree_sec ?? null,
            };
          }),
        );

        const post = await this.prisma.feed_post.create({
          data: {
            cite_id: citeId,
            auteur_id: userId,
            contenu,
            likes_count: 0,
            commentaires_count: 0,
            created_at: new Date(),
            created_by: userId,
            feed_post_media: {
              create: stored.map((s) => ({
                cite_id: citeId,
                type: s.type,
                file_path: s.file_path,
                mime_type: s.mime_type,
                taille_ko: s.taille_ko,
                ordre: s.ordre,
                largeur: s.largeur,
                hauteur: s.hauteur,
                duree_sec: s.duree_sec,
                created_at: new Date(),
                created_by: userId,
              })),
            },
          },
          include: {
            user: { select: userSelect(citeId) },
            feed_post_media: { orderBy: { ordre: "asc" as const } },
          },
        });

        await this.notif.sendToCite(
          citeId,
          "Nouveau post",
          contenu ?? "Nouveau média partagé",
          { exceptUserId: userId, typeId: 12, data: { post_id: post.id } },
        );
        this.chat.emitToCite(citeId, "feed:nouveau", {
          post_id: post.id,
          auteur_id: userId,
        });

      return this.toPostDto(post, bucket, ttl, false);
    } finally {
      await Promise.all(
        all.map((f) => fs.promises.unlink(f.path).catch(() => undefined)),
      );
    }
  }

  private async previewsForPosts(
    postIds: string[],
    citeId: string,
    bucket: string,
    ttl: number,
    cache?: AuthorCache,
  ) {
    const map = new Map<string, CommentRow[]>();
    if (postIds.length === 0) return map;
    const rows = await this.prisma.feed_post_commentaire.findMany({
      where: {
        post_id: { in: postIds },
        is_deleted: false,
        niveau: 1,
      },
      orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
      include: { user: { select: userSelect(citeId) } },
    });
    for (const c of rows) {
      const arr = map.get(c.post_id) ?? [];
      if (arr.length < PREVIEW_COMMENTS) {
        arr.push(c);
        map.set(c.post_id, arr);
      }
    }
    return map;
  }

  async findAll(citeId: string, userId: string, query: FeedQueryDto) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const bucket = await this.upload.bucket();
    const ttl = await this.presignTtl();

    const rows = await this.prisma.feed_post.findMany({
      where: { cite_id: citeId, is_deleted: false },
      orderBy: [{ created_at: "desc" as const }, { id: "desc" as const }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        user: { select: userSelect(citeId) },
        feed_post_media: {
          where: { is_deleted: false },
          orderBy: { ordre: "asc" as const },
        },
        feed_post_like: {
          where: { user_id: userId },
          select: { post_id: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const authorCache: AuthorCache = new Map();
    const previewMap = await this.previewsForPosts(
      page.map((p) => p.id),
      citeId,
      bucket,
      ttl,
      authorCache,
    );

    const items = await Promise.all(
      page.map((p) =>
        this.toPostDto(
          p,
          bucket,
          ttl,
          p.feed_post_like.length > 0,
          previewMap.get(p.id) ?? [],
          authorCache,
        ),
      ),
    );

    return {
      items,
      next_cursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async findOne(id: string, citeId: string, userId: string) {
    await this.getPostOrThrow(id, citeId);
    const bucket = await this.upload.bucket();
    const ttl = await this.presignTtl();
    const authorCache: AuthorCache = new Map();

    const post = await this.prisma.feed_post.findUnique({
      where: { id },
      include: {
        user: { select: userSelect(citeId) },
        feed_post_media: {
          where: { is_deleted: false },
          orderBy: { ordre: "asc" as const },
        },
        feed_post_like: {
          where: { user_id: userId },
          select: { post_id: true },
        },
      },
    });
    if (!post) throw new NotFoundException("Post introuvable");

    const preview = await this.prisma.feed_post_commentaire.findMany({
      where: { post_id: id, is_deleted: false, niveau: 1 },
      orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
      take: PREVIEW_COMMENTS,
      include: { user: { select: userSelect(citeId) } },
    });

    return this.toPostDto(
      post,
      bucket,
      ttl,
      post.feed_post_like.length > 0,
      preview,
      authorCache,
    );
  }

  /** Commentaires d'un post — pagination keyset des racines (niveau 1) + réponses. */
  async findCommentaires(
    postId: string,
    citeId: string,
    query: FeedQueryDto,
  ) {
    await this.getPostOrThrow(postId, citeId);
    const limit = query.limit ?? DEFAULT_COMMENTS_PAGE_SIZE;
    const bucket = await this.upload.bucket();
    const ttl = await this.presignTtl();
    const authorCache: AuthorCache = new Map();

    const rows = await this.prisma.feed_post_commentaire.findMany({
      where: { post_id: postId, is_deleted: false, niveau: 1 },
      orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { user: { select: userSelect(citeId) } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const parentIds = page.map((c) => c.id);
    const replies = parentIds.length
      ? await this.prisma.feed_post_commentaire.findMany({
          where: {
            post_id: postId,
            is_deleted: false,
            niveau: 2,
            parent_id: { in: parentIds },
          },
          orderBy: [{ created_at: "asc" as const }, { id: "asc" as const }],
          include: { user: { select: userSelect(citeId) } },
        })
      : [];

    const repliesByParent = new Map<string, CommentRow[]>();
    for (const r of replies) {
      const parentId = r.parent_id;
      if (!parentId) continue;
      const arr = repliesByParent.get(parentId) ?? [];
      arr.push(r);
      repliesByParent.set(parentId, arr);
    }

    const items = await Promise.all(
      page.map((c) =>
        this.toCommentNode(
          c,
          bucket,
          ttl,
          repliesByParent.get(c.id) ?? [],
          authorCache,
        ),
      ),
    );

    return {
      items,
      next_cursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Like idempotent : déjà liké → no-op. */
  async like(postId: string, citeId: string, userId: string) {
    const post = await this.getPostOrThrow(postId, citeId);
    const key = { post_id_user_id: { post_id: postId, user_id: userId } };

    const existing = await this.prisma.feed_post_like.findUnique({
      where: key,
    });
    if (existing) {
      return { liked: true, likes_count: post.likes_count };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.feed_post_like.create({
        data: { post_id: postId, user_id: userId },
      }),
      this.prisma.feed_post.update({
        where: { id: postId },
        data: { likes_count: { increment: 1 } },
      }),
    ]);

    if (post.auteur_id !== userId) {
      await this.notif.sendToUser({
        cite_id: citeId,
        user_id: post.auteur_id,
        titre: "Like sur votre post",
        message: "Un habitant a aimé votre publication.",
        typeId: 13,
        data: { post_id: postId, user_id: userId },
      });
    }
    this.chat.emitToCite(citeId, "feed:like", {
      post_id: postId,
      user_id: userId,
      liked: true,
      likes_count: updated.likes_count,
    });
    return { liked: true, likes_count: updated.likes_count };
  }

  /** Unlike idempotent : pas liké → no-op. */
  async unlike(postId: string, citeId: string, userId: string) {
    const post = await this.getPostOrThrow(postId, citeId);
    const key = { post_id_user_id: { post_id: postId, user_id: userId } };

    const existing = await this.prisma.feed_post_like.findUnique({
      where: key,
    });
    if (!existing) {
      return { liked: false, likes_count: post.likes_count };
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.feed_post_like.delete({ where: key }),
      this.prisma.feed_post.update({
        where: { id: postId },
        data: { likes_count: { decrement: 1 } },
      }),
    ]);

    this.chat.emitToCite(citeId, "feed:like", {
      post_id: postId,
      user_id: userId,
      liked: false,
      likes_count: updated.likes_count,
    });
    return { liked: false, likes_count: updated.likes_count };
  }

  async addCommentaire(
    postId: string,
    citeId: string,
    userId: string,
    dto: CommentaireDto,
  ) {
    const post = await this.getPostOrThrow(postId, citeId);
    const [commentaire] = await this.prisma.$transaction([
      this.prisma.feed_post_commentaire.create({
        data: {
          post_id: postId,
          auteur_id: userId,
          niveau: 1,
          texte: dto.texte,
          created_at: new Date(),
          created_by: userId,
        },
        include: { user: { select: userSelect(citeId) } },
      }),
      this.prisma.feed_post.update({
        where: { id: postId },
        data: { commentaires_count: { increment: 1 } },
      }),
    ]);

    if (post.auteur_id !== userId) {
      await this.notif.sendToUser({
        cite_id: citeId,
        user_id: post.auteur_id,
        titre: "Commentaire sur votre post",
        message: dto.texte,
        typeId: 14,
        data: {
          post_id: postId,
          user_id: userId,
          commentaire_id: commentaire.id,
        },
      });
    }
    this.chat.emitToCite(citeId, "feed:commentaire", {
      post_id: postId,
      commentaire_id: commentaire.id,
      user_id: userId,
    });

    const bucket = await this.upload.bucket();
    const ttl = await this.presignTtl();
    return this.toCommentBase(commentaire, bucket, ttl);
  }

  async repondre(
    postId: string,
    commentId: string,
    citeId: string,
    userId: string,
    dto: CommentaireDto,
  ) {
    await this.getPostOrThrow(postId, citeId);
    const parent = await this.prisma.feed_post_commentaire.findFirst({
      where: { id: commentId, post_id: postId, is_deleted: false },
    });
    if (!parent) throw new NotFoundException("Commentaire introuvable");
    if (parent.niveau >= 2) {
      throw new BadRequestException(
        "Profondeur maximale de 2 niveaux atteinte",
      );
    }

    const [commentaire] = await this.prisma.$transaction([
      this.prisma.feed_post_commentaire.create({
        data: {
          post_id: postId,
          auteur_id: userId,
          parent_id: parent.id,
          niveau: (parent.niveau + 1) as 1 | 2,
          texte: dto.texte,
          created_at: new Date(),
          created_by: userId,
        },
        include: { user: { select: userSelect(citeId) } },
      }),
      this.prisma.feed_post.update({
        where: { id: postId },
        data: { commentaires_count: { increment: 1 } },
      }),
    ]);

    this.chat.emitToCite(citeId, "feed:commentaire", {
      post_id: postId,
      commentaire_id: commentaire.id,
      user_id: userId,
    });

    const bucket = await this.upload.bucket();
    const ttl = await this.presignTtl();
    return this.toCommentBase(commentaire, bucket, ttl);
  }

  async remove(id: string, citeId: string, userId: string) {
    const post = await this.getPostOrThrow(id, citeId);

    if (post.auteur_id !== userId) {
      const session = await this.auth.getSession(userId);
      if (!session?.features?.includes("FEED_MODERATE")) {
        throw new ForbiddenException(
          "Vous ne pouvez supprimer que vos propres posts",
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.feed_post_media.updateMany({
        where: { post_id: id },
        data: { is_deleted: true, deleted_at: new Date(), deleted_by: userId },
      }),
      this.prisma.feed_post.update({
        where: { id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by: userId,
        },
      }),
    ]);

    this.chat.emitToCite(citeId, "feed:suppression", { post_id: id });

    return { id, deleted: true };
  }
}
