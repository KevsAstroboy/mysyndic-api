## 1. Générateur — modules de base

- [x] 1.1 Générer module `annonce` via `scripts/generate-module.ts` (CRUD scoped + soft-delete)
- [x] 1.2 Générer module `alerte` via générateur
- [x] 1.3 Générer module `incident` via générateur
- [x] 1.4 Générer module `conflit` via générateur
- [x] 1.5 Enregistrer les 4 modules dans `app.module.ts`
- [x] 1.6 `npx prisma generate` si relations manquantes + build `nest build` sans erreur

## 2. Annonce — CRUD complet

- [x] 2.1 DTO : CreateAnnonceDto (titre/contenu requis, categorie_id, est_epinglee), UpdateAnnonceDto
- [x] 2.2 Service : create (cite_id + auteur), findAll (epinglees first puis date desc), update
- [x] 2.3 Service : remove (soft-delete : is_deleted, deleted_at, deleted_by)
- [x] 2.4 Controller : GET/POST /annonces, PATCH/DELETE /annonces/:id + features (ANNONCE_READ/CREATE/UPDATE/DELETE)

## 3. Alerte — workflow

- [x] 3.1 DTO : CreateAlerteDto, UpdateStatutAlerteDto, ResoudreAlerteDto
- [x] 3.2 Service : create (statut par défaut non résolu, escalade=false)
- [x] 3.3 Service : findActives (non résolues), findHistorique (toutes, non supprimées, date desc)
- [x] 3.4 Service : updateStatut, escalade (escalade_at si false→true), resoudre (resolu_par + resolu_at + statut résolu)
- [x] 3.5 Controller : POST /alertes, GET /alertes/actives, GET /alertes/historique, PATCH /alertes/:id/statut, PATCH /alertes/:id/resoudre + features ALERTE_*

## 4. Incident — signalement + likes + commentaires

- [x] 4.1 DTO : CreateIncidentDto, CommentaireDto, RepondreCommentaireDto
- [x] 4.2 Service incident : create, findAll, findOne (avec likes count, likedByMe, commentaires arborescents)
- [x] 4.3 Service likes : toggle (create si absent, delete si présent — PK composite)
- [x] 4.4 Service commentaires : commenter (niveau 1), repondre (niveau 2, validation parent niveau, refus profondeur 3+ → 400)
- [x] 4.5 Controller : POST/GET /incidents, GET /incidents/:id, POST/DELETE /incidents/:id/like, POST /incidents/:id/commentaires, POST /incidents/:id/commentaires/:commentId/repondre + features INCIDENT_*

## 5. Conflit — workflow syndic

- [x] 5.1 DTO : CreateConflitDto, PrendreEnChargeDto, ResoudreConflitDto (resolution_note), NoteSyndicDto
- [x] 5.2 Service : create (statut initial non traité), findMine (declarant), findAll (cité, date desc)
- [x] 5.3 Service : prendreEnCharge (pris_en_charge_par/at + statut), 409 si déjà pris en charge
- [x] 5.4 Service : resoudre (statut résolu + resolu_at + resolution_note), noteSyndic (sans résolution)
- [x] 5.5 Controller : POST/GET /conflits, GET /conflits/mes-conflits, PATCH /conflits/:id/prise-en-charge, PATCH /conflits/:id/resoudre, PATCH /conflits/:id/note + features CONFLIT_*

## 6. Fermeture & qualité

- [x] 6.1 Notifications : alerte créée → syndics (si NotifService permet ciblage, sinon différé documenté)
- [x] 6.2 Vérifier scoping cité sur chaque endpoint (chaque query filtre `cite_id`)
- [x] 6.3 Build `nest build` 0 erreur
- [x] 6.4 Suite e2e existante (auth/guards/modules/user/paiement) reste verte (non-régression)
- [x] 6.5 Tests e2e sprint-3 : annonce CRUD + scoping
- [x] 6.6 Tests e2e sprint-3 : alerte workflow (create/actives/historique/resoudre)
- [x] 6.7 Tests e2e sprint-3 : incident (create/findOne/like toggle/commentaires 2 niveaux/profondeur 3 rejet)
- [x] 6.8 Tests e2e sprint-3 : conflit (create/mine/all/prise en charge 409/résolution note)