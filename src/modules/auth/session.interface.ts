export interface SessionProfil {
  userProfilId: string;
  profilId: number;
  libelle: string;
  code: string;
  citeId: string | null;
  citeNom: string | null;
  orderPriority: number;
}

export interface SessionCache {
  userId: string;
  /** user_profil actif courant (null si aucun profil actif) */
  userProfilId: string | null;
  role: string;
  citeId: string | null;
  mustChangePassword: boolean;
  /** Tous les profils actifs de l'utilisateur (pour le sélecteur) */
  profils: SessionProfil[];
  /** Features du profil actif uniquement */
  features: string[];
  profilVersions: Record<number, string>;
}

export interface SessionOptions {
  /** Force le contexte actif sur un user_profil précis (switch). */
  userProfilId?: string;
}
