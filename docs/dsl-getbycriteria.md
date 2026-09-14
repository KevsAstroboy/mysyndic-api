# DSL `get-by-criteria` — requêtes de listes paginées et filtrées

Chaque module expose une route `GET .../get-by-criteria` acceptant un **DSL par query params**. Elle sert de **liste paginée + filtres + tri + projection** pour l'UI (et remplace les endpoints de liste figés).

## Syntaxe générale

```
GET /api/<module>/get-by-criteria?<paramètres>
```

| Paramètre | Rôle | Exemple |
|---|---|---|
| `<champ>.<opérateur>` | Filtre | `statut_id.eq=2`, `montant.gte=25000` |
| `sort` | Tri (multi champs, séparés par `,`) | `sort=-created_at,numero` |
| `fields` | Champs scalaires retournés (projection) | `fields=id,numero,rue` |
| `include` | Relations Prisma embarquées | `include=user,villa` |
| `page` | Page (≥1, défaut 1) | `page=2` |
| `size` | Taille (≥1, ≤1000, défaut 20) | `size=50` |
| `logic` | `and` (défaut) ou `or` entre les filtres | `logic=or` |

Un paramètre non reconnu ou invalide est **silencieusement ignoré** (aucune erreur).

## Opérateurs de filtre

Format : `nom_du_champ.<op>=valeur`

| Opérateur | Signification | Exemple |
|---|---|---|
| `eq` | égal | `statut_id.eq=2` |
| `neq` | différent | `villa_id.neq=...` |
| `gt` / `gte` | > / ≥ | `montant.gte=25000` |
| `lt` / `lte` | < / ≤ | `created_at.lte=2026-09-30` |
| `in` | liste (CSV) | `statut_id.in=1,2,3` |
| `nin` | hors liste | `profil_id.nin=4,5` |
| `like` | contient (insensible casse) | `numero.like=VIL` |
| `bt` | entre bornes **inclusives** `[a,b]` | `montant.bt=10000,50000` |
| `btio` | `[a, b[` (borne sup exclue) | `created_at.btio=2026-09-01,2026-10-01` |
| `btoi` | `]a, b]` (borne inf exclue) | `montant.btoi=10000,50000` |
| `btoo` | `]a, b[` (strict) | `montant.btoo=10000,50000` |
| `null` | est NULL | `deleted_at.null` |
| `nnull` | n'est pas NULL | `deleted_at.nnull` |

Types de valeur — conversion automatique :
- `true`/`false` → booléen ;
- valeur numérique → nombre ;
- sinon chaîne (dates ISO-8601 `2026-09-30` / `2026-09-30T12:00:00Z` acceptées par Prisma sur les champs `DateTime`).

`in`/`nin` : plusieurs valeurs CSV (`statut_id.in=1,2`). `bt*` : exactement 2 valeurs CSV ; sinon le filtre est ignoré.

## Champs & relations autorisées

- Un **filtre n'est appliqué que sur un champ scalaire du modèle Prisma ciblé** (`isValidColumn`). Les champs inconnus, relations, préfixes `_`/`__` ou expressions non alphanumériques sont ignorés.
- `fields` = scalaires uniquement ; `include` = relations Prisma uniquement (`user`, `villa`, `cite`, `statut_paiement`, `profil`… selon le modèle).
- `fields` et `include` peuvent se combiner.
- Filtrage **sur relation (ex. `user.prenom.like`) non supporté** : filtrer d'abord puis inclure.

## Sécurité & scoping (important)

Chaque route **ajoute automatiquement** des conditions non modifiables par le client :

- La **cité de la session active** (`cite_id`) — sauf exceptions SA documentées ;
- `is_deleted: false` (soft-delete masqué) ;
- `notification` : scopé sur l'**utilisateur connecté** (`user_id`).

Le `logic=or` ne s'applique **qu'entre les filtres DSL**. La base de sécurité est toujours combinée en `AND` → impossible de filtrer hors de sa cité.

## Réponse (paginée)

```json
{
  "items": [ ... ],
  "total": 137,
  "page": 1,
  "size": 20,
  "pages": 7
}
```

- `total` = nombre total sans pagination ; `pages = ceil(total / size)`.
- `items` vide si aucune page.

## Endpoints disponibles

| Module | Route | Feature RBAC | Modèle | Scope automatique |
|---|---|---|---|---|
| Paiements | `GET /api/paiements/get-by-criteria` | `PAIEMENT_READ_ALL` | `paiement` | cité active |
| Alertes | `GET /api/alertes/get-by-criteria` | `ALERTE_READ_HISTORY` | `alerte_securite` | cité active |
| Incidents | `GET /api/incidents/get-by-criteria` | `INCIDENT_READ` | `incident` | cité active |
| Annonces | `GET /api/annonces/get-by-criteria` | `ANNONCE_READ` | `annonce` | cité active |
| Conflits | `GET /api/conflits/get-by-criteria` | `CONFLIT_READ_ALL` | `conflit` | cité active |
| Villas | `GET /api/villas/get-by-criteria` | `HABITANT_READ` | `villa` | cité active — **SA (sans cité) = toutes les cités** |
| Users | `GET /api/users/get-by-criteria` | `HABITANT_READ` | `user` | cité active |
| Notifications | `GET /api/notifications/get-by-criteria` | (connecté) | `notification` | user connecté |

Sur les modules scopés cité, un utilisateur **sans cité active** (SA non scopé) reçoit `403` — sauf `/villas` qui liste tout en SA.

## Exemples

**1. Villas d'une cité dont le numéro contient « VIL », triées par numéro, 1re page**

```
GET /api/villas/get-by-criteria?numero.like=VIL&sort=numero&page=1&size=20
```

**2. Paiements confirmés du mois de septembre ≥ 25 000 F, avec la villa**

```
GET /api/paiements/get-by-criteria?mois.eq=2026-09&statut_id.eq=2&montant.gte=25000&sort=-created_at&include=villa
```

**3. Utilisateurs prénom contenant « A », profil habitant ou chef sécu, projection légère**

```
GET /api/users/get-by-criteria?prenom.like=a&profil_id.in=5,4&fields=id,prenom,nom,email&size=50
```

**4. Notifications non lues (logique `or` entre 2 critères de date)**

```
GET /api/notifications/get-by-criteria?lu.eq=false&created_at.gt=2026-08-01&logic=and
```

## Notes d'implémentation

- Service : `src/common/criteria/criteria.service.ts` (`paginate(model, query, baseWhere)`), parser `criteria-parser.ts`, builder `criteria.builder.ts`.
- Les champs valides sont dérivés du **DMMF Prisma** à l'exécution → toujours synchrones avec le schéma.
- Un champ `DateTime` comparé avec `gt/lt/bt*` accepte une chaîne ISO‑8601.
- Le tri multi-champs utilise `sort=champ1,-champ2` (préfixe `-` = desc, `+` ou rien = asc).
