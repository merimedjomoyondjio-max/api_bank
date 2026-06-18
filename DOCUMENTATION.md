# BIREC Bank API — Documentation complète

> API REST de gestion bancaire développée pour le groupe BIREC (Cameroun).  
> Stack : Node.js · Express · SQLite · Sequelize · JWT

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture du projet](#2-architecture-du-projet)
3. [Base de données — Modèles](#3-base-de-données--modèles)
4. [Authentification et sécurité](#4-authentification-et-sécurité)
5. [API Endpoints — Référence complète](#5-api-endpoints--référence-complète)
   - [Auth](#51-auth--apiauth)
   - [Comptes](#52-comptes--apiaccounts)
   - [Transactions](#53-transactions--apitransactions)
   - [Banques](#54-banques--apibanks)
   - [Administration](#55-administration--apiadmin)
6. [Codes d'erreur standard](#6-codes-derreur-standard)
7. [Installation et lancement](#7-installation-et-lancement)
8. [Tests et couverture](#8-tests-et-couverture)
9. [Déploiement Render](#9-déploiement-render)
10. [Frontend SPA](#10-frontend-spa)
11. [Variables d'environnement](#11-variables-denvironnement)
12. [Données par défaut (seed)](#12-données-par-défaut-seed)

---

## 1. Vue d'ensemble

BIREC Bank API est un backend bancaire complet qui expose une API REST JSON. Elle gère :

- L'inscription et la connexion des clients avec JWT
- La création et la gestion de comptes bancaires (courant, épargne, entreprise)
- Les opérations financières : dépôt, retrait, virement
- L'historique des transactions avec filtres
- Un panel d'administration (stats, gestion utilisateurs, supervision)
- Un frontend SPA intégré (HTML/CSS/JS vanilla) servi statiquement

**Monnaie :** FCFA (XAF)  
**Pays :** Cameroun  
**Port par défaut :** 3000

---

## 2. Architecture du projet

```
bank-api/
├── server.js                    ← Point d'entrée : démarre le serveur, sync DB, seed
├── src/
│   ├── app.js                   ← Configuration Express (CORS, routes, errorHandler)
│   ├── config/
│   │   └── database.js          ← Connexion Sequelize/SQLite
│   ├── models/
│   │   ├── User.js              ← Modèle utilisateur (bcrypt, JWT)
│   │   ├── Bank.js              ← Modèle banque
│   │   ├── Account.js           ← Modèle compte (relations User + Bank)
│   │   └── Transaction.js       ← Modèle transaction (relation Account)
│   ├── controllers/
│   │   ├── authController.js    ← Inscription, login, profil, mot de passe
│   │   ├── accountController.js ← CRUD comptes + solde + fermeture
│   │   ├── transactionController.js ← Dépôt, retrait, virement, historique
│   │   ├── bankController.js    ← CRUD banques
│   │   └── adminController.js   ← Stats, gestion users/accounts/transactions
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── accountRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── bankRoutes.js
│   │   └── adminRoutes.js
│   └── middleware/
│       ├── auth.js              ← protect (JWT) + authorize (rôles)
│       └── errorHandler.js      ← Gestion centralisée des erreurs Sequelize
├── public/                      ← Frontend SPA (servi statiquement)
│   └── index.html
├── data/
│   └── database.sqlite          ← Fichier SQLite (créé automatiquement)
├── tests/
│   ├── setup.js                 ← Init DB en mémoire pour les tests
│   ├── helpers.js               ← Utilitaires (api wrapper, seeders de test)
│   ├── auth.test.js             ← 16 tests auth
│   ├── accounts.test.js         ← 13 tests comptes
│   ├── transactions.test.js     ← 20 tests transactions
│   ├── banks.test.js            ← 16 tests banques
│   ├── admin.test.js            ← 25 tests admin
│   └── coverage.test.js         ← 57 tests ciblant 100% de couverture
├── render.yaml                  ← Config déploiement Render
└── package.json
```

### Flux d'une requête

```
Client HTTP
    │
    ▼
app.js ── Middleware CORS (OPTIONS → 200)
    │
    ├── express.json() + urlencoded()
    │
    ├── express.static('public/')  ← frontend
    │
    ├── /api/auth      → authRoutes
    ├── /api/accounts  → accountRoutes  ← protect (JWT)
    ├── /api/transactions → transactionRoutes ← protect
    ├── /api/banks     → bankRoutes  ← protect [+ authorize('admin')]
    ├── /api/admin     → adminRoutes ← protect + authorize('admin')
    │
    ├── GET *  → index.html  (SPA fallback)
    │
    └── errorHandler (erreurs Sequelize → 400/500)
```

---

## 3. Base de données — Modèles

### 3.1 Schéma relationnel

```
User ──< Account ──< Transaction
 │           │
 │           └──> Bank
 │
 └── (rôle: user | admin)
```

### 3.2 User

| Champ      | Type          | Contraintes                        | Description                     |
|------------|---------------|------------------------------------|---------------------------------|
| id         | UUID          | PK, auto-généré (UUIDV4)           | Identifiant unique              |
| firstName  | STRING        | NOT NULL, 2–50 chars               | Prénom                          |
| lastName   | STRING        | NOT NULL, 2–50 chars               | Nom                             |
| email      | STRING        | NOT NULL, UNIQUE, format email     | Email (identifiant de connexion)|
| password   | STRING        | NOT NULL, 6–100 chars, bcrypt×12   | Mot de passe hashé              |
| phone      | STRING        | NOT NULL                           | Téléphone                       |
| address    | JSON          | `{street, city, postalCode, country}` | Adresse postale              |
| role       | ENUM          | `user` \| `admin`, défaut `user`   | Rôle d'accès                    |
| isActive   | BOOLEAN       | défaut `true`                      | Compte actif/suspendu           |
| createdAt  | DATE          | auto                               | Date de création                |
| updatedAt  | DATE          | auto                               | Dernière modification           |

**Hooks :**
- `beforeCreate` : hash du mot de passe avec bcrypt (saltRounds = 12)
- `beforeUpdate` : re-hash si le mot de passe a changé

**Méthodes d'instance :**
- `comparePassword(candidatePassword)` → `boolean`
- `toJSON()` → supprime le champ `password` de la réponse

### 3.3 Bank

| Champ       | Type   | Contraintes            | Description             |
|-------------|--------|------------------------|-------------------------|
| id          | UUID   | PK, auto-généré        | Identifiant unique      |
| name        | STRING | NOT NULL               | Nom de la banque        |
| code        | STRING | UNIQUE                 | Code banque (auto si absent : `BNKxxxxxx`) |
| email       | STRING | format email, nullable | Email de contact        |
| phone       | STRING | nullable               | Téléphone               |
| city        | STRING | nullable               | Ville                   |
| country     | STRING | défaut `Cameroon`      | Pays                    |
| description | TEXT   | nullable               | Description             |
| status      | ENUM   | `actif` \| `inactif`, défaut `actif` | Statut |

**Hook :** `beforeValidate` : génère un code automatique si absent.

### 3.4 Account

| Champ          | Type          | Contraintes                         | Description                      |
|----------------|---------------|-------------------------------------|----------------------------------|
| id             | UUID          | PK, auto-généré                     | Identifiant unique               |
| accountNumber  | STRING        | UNIQUE, NOT NULL                    | Numéro de compte (auto : `CM` + timestamp + 4 chiffres) |
| type           | ENUM          | `compte_courant` \| `compte_epargne` \| `compte_entreprise` | Type de compte |
| balance        | DECIMAL(15,2) | défaut 0, min 0                     | Solde en FCFA                    |
| currency       | STRING        | défaut `XAF`                        | Devise (FCFA)                    |
| status         | ENUM          | `actif` \| `ferme` \| `suspendu`   | Statut du compte                 |
| interestRate   | FLOAT         | défaut 0                            | Taux d'intérêt                   |
| overdraftLimit | DECIMAL(15,2) | défaut 0                            | Limite de découvert              |
| userId         | UUID (FK)     | → User                              | Propriétaire                     |
| bankId         | UUID (FK)     | → Bank, nullable                    | Banque associée                  |

**Hook :** `beforeValidate` : génère `accountNumber` si absent.

**Relations :**
- `User.hasMany(Account)` — un utilisateur peut avoir plusieurs comptes
- `Account.belongsTo(User)`
- `Bank.hasMany(Account)` — une banque peut avoir plusieurs comptes
- `Account.belongsTo(Bank)`

### 3.5 Transaction

| Champ             | Type          | Contraintes                                  | Description               |
|-------------------|---------------|----------------------------------------------|---------------------------|
| id                | UUID          | PK, auto-généré                              | Identifiant unique        |
| reference         | STRING        | UNIQUE                                       | Référence (auto : `TXN` + timestamp + 6 chars aléatoires) |
| type              | ENUM          | `depot` \| `retrait` \| `transfert` \| `paiement` | Type d'opération     |
| amount            | DECIMAL(15,2) | NOT NULL, min 0.01                           | Montant                   |
| description       | STRING        | défaut `''`                                  | Libellé                   |
| status            | ENUM          | `en_attente` \| `complete` \| `echoue` \| `annule` | Statut               |
| fromAccountNumber | STRING        | nullable                                     | Compte source (virements) |
| toAccountNumber   | STRING        | nullable                                     | Compte dest. (virements)  |
| accountId         | UUID (FK)     | → Account                                    | Compte lié                |

**Hook :** `beforeCreate` : génère `reference` si absente.

**Relations :**
- `Account.hasMany(Transaction)`
- `Transaction.belongsTo(Account)`

---

## 4. Authentification et sécurité

### 4.1 JWT (JSON Web Token)

L'API utilise JWT Bearer Token pour protéger les routes privées.

**Génération :** à la connexion ou à l'inscription
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

**Utilisation :** dans le header `Authorization` de chaque requête protégée
```
Authorization: Bearer <token>
```

**Durée de vie :** définie par `JWT_EXPIRE` (ex : `7d`, `1h`)

### 4.2 Middleware `protect`

Vérifie la présence et la validité du token JWT.

```
Requête
  │
  ├── Pas de token → 401 "Non autorisé - Token manquant"
  │
  ├── Token invalide/expiré → 401 "Non autorisé - Token invalide"
  │
  ├── User introuvable en DB → 401 "Utilisateur non trouvé"
  │
  └── OK → req.user = { id, firstName, lastName, role, ... } → next()
```

### 4.3 Middleware `authorize(...roles)`

Vérifie le rôle de l'utilisateur après `protect`.

```
req.user.role non inclus dans roles → 403 "Accès refusé - Rôle insuffisant"
```

### 4.4 Hachage des mots de passe

bcrypt avec `saltRounds = 12`. Le mot de passe n'est **jamais** retourné dans les réponses JSON (supprimé par `toJSON()`).

### 4.5 CORS

En-têtes configurés globalement dans `app.js` :
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```
Les requêtes `OPTIONS` (preflight) retournent immédiatement `200`.

---

## 5. API Endpoints — Référence complète

> Convention de réponse :
> - Succès → `{ "success": true, ... }`
> - Échec  → `{ "success": false, "message": "..." }`

---

### 5.1 Auth — `/api/auth`

#### `POST /api/auth/register` — Inscription

Crée un nouvel utilisateur avec le rôle `user`.

**Corps de la requête :**
```json
{
  "firstName": "Jean",
  "lastName": "Dupont",
  "email": "jean.dupont@example.cm",
  "password": "MonMotDePasse1!",
  "phone": "+237 600 000 001",
  "address": {
    "street": "Rue de la Paix",
    "city": "Yaoundé",
    "postalCode": "00100",
    "country": "Cameroun"
  }
}
```

**Réponse 201 :**
```json
{
  "success": true,
  "token": "eyJ...",
  "user": {
    "id": "uuid",
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean.dupont@example.cm",
    "role": "user",
    "isActive": true
  }
}
```

| Cas d'erreur                  | Code |
|-------------------------------|------|
| Email déjà utilisé            | 400  |
| Erreur serveur                | 500  |

---

#### `POST /api/auth/login` — Connexion

**Corps de la requête :**
```json
{
  "email": "jean.dupont@example.cm",
  "password": "MonMotDePasse1!"
}
```

**Réponse 200 :**
```json
{
  "success": true,
  "token": "eyJ...",
  "user": { ... }
}
```

| Cas d'erreur                  | Code |
|-------------------------------|------|
| Email ou mot de passe manquant | 400 |
| Email introuvable              | 401  |
| Mauvais mot de passe           | 401  |

---

#### `GET /api/auth/profile` — Mon profil `[protect]`

Retourne le profil de l'utilisateur connecté avec la liste de ses comptes.

**Réponse 200 :**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "firstName": "Jean",
    "lastName": "Dupont",
    "email": "jean.dupont@example.cm",
    "phone": "+237 600 000 001",
    "role": "user",
    "isActive": true,
    "accounts": [
      {
        "id": "uuid",
        "accountNumber": "CM12345678901234",
        "type": "compte_courant",
        "balance": "25000.00",
        "currency": "XAF",
        "status": "actif"
      }
    ]
  }
}
```

---

#### `PUT /api/auth/profile` — Modifier le profil `[protect]`

**Corps de la requête :**
```json
{
  "firstName": "Jean-Pierre",
  "lastName": "Dupont",
  "phone": "+237 699 000 001",
  "address": { "city": "Douala" }
}
```

**Réponse 200 :** `{ "success": true, "user": { ... } }`

---

#### `PUT /api/auth/change-password` — Changer le mot de passe `[protect]`

**Corps de la requête :**
```json
{
  "currentPassword": "AncienMotDePasse1!",
  "newPassword": "NouveauMotDePasse2!"
}
```

**Réponse 200 :** `{ "success": true, "message": "Mot de passe modifié avec succès" }`

| Cas d'erreur                  | Code |
|-------------------------------|------|
| Mot de passe actuel incorrect | 401  |

---

### 5.2 Comptes — `/api/accounts`

Toutes les routes sont protégées par `protect`. Un utilisateur n'accède qu'à **ses propres comptes**.

---

#### `POST /api/accounts` — Créer un compte `[protect]`

**Corps de la requête :**
```json
{
  "type": "compte_courant",
  "currency": "XAF",
  "initialDeposit": 50000,
  "bankId": "uuid-de-la-banque"
}
```

> Tous les champs sont optionnels. Valeurs par défaut :
> - `type` → `"compte_courant"`
> - `currency` → `"XAF"`
> - `initialDeposit` → `0`
> - `bankId` → `null`

**Réponse 201 :**
```json
{
  "success": true,
  "account": {
    "id": "uuid",
    "accountNumber": "CM16789012345678",
    "type": "compte_courant",
    "balance": "50000.00",
    "currency": "XAF",
    "status": "actif",
    "bankId": "uuid-banque",
    "userId": "uuid-user"
  }
}
```

---

#### `GET /api/accounts` — Mes comptes `[protect]`

**Réponse 200 :**
```json
{
  "success": true,
  "count": 2,
  "accounts": [ { ... }, { ... } ]
}
```

---

#### `GET /api/accounts/:id` — Détail d'un compte `[protect]`

**Réponse 200 :** `{ "success": true, "account": { ... } }`

| Cas d'erreur         | Code |
|----------------------|------|
| Compte introuvable   | 404  |

---

#### `GET /api/accounts/:id/balance` — Solde d'un compte `[protect]`

**Réponse 200 :**
```json
{
  "success": true,
  "balance": "25000.00",
  "currency": "XAF",
  "accountNumber": "CM16789012345678"
}
```

| Cas d'erreur         | Code |
|----------------------|------|
| Compte introuvable   | 404  |

---

#### `DELETE /api/accounts/:id` — Fermer un compte `[protect]`

Passe le statut du compte à `ferme`. Le solde doit être à 0.

**Réponse 200 :** `{ "success": true, "message": "Compte fermé avec succès" }`

| Cas d'erreur                          | Code |
|---------------------------------------|------|
| Compte introuvable                    | 404  |
| Solde positif (impossible de fermer)  | 400  |

---

### 5.3 Transactions — `/api/transactions`

Toutes les routes sont protégées par `protect`. Toutes les opérations financières s'exécutent dans une **transaction Sequelize** — elles sont atomiques (tout ou rien).

---

#### `POST /api/transactions/:id/deposit` — Dépôt `[protect]`

Dépose un montant sur le compte `:id`.

**Corps de la requête :**
```json
{
  "amount": 25000,
  "description": "Versement salaire"
}
```

**Réponse 200 :**
```json
{
  "success": true,
  "transaction": {
    "id": "uuid",
    "reference": "TXN17234567890ABCDE",
    "type": "depot",
    "amount": "25000.00",
    "description": "Versement salaire",
    "status": "complete",
    "accountId": "uuid"
  },
  "newBalance": 75000
}
```

| Cas d'erreur                  | Code |
|-------------------------------|------|
| Montant ≤ 0                   | 400  |
| Compte introuvable            | 404  |

---

#### `POST /api/transactions/:id/withdraw` — Retrait `[protect]`

**Corps de la requête :**
```json
{
  "amount": 10000,
  "description": "Retrait guichet"
}
```

> `description` est optionnel. Valeur par défaut : `"Retrait en espèces"`.

**Réponse 200 :**
```json
{
  "success": true,
  "transaction": { ... },
  "newBalance": 65000
}
```

| Cas d'erreur                  | Code |
|-------------------------------|------|
| Montant ≤ 0                   | 400  |
| Compte introuvable            | 404  |
| Solde insuffisant             | 400  |

---

#### `POST /api/transactions/:id/transfer` — Virement `[protect]`

Transfère un montant du compte `:id` vers `toAccountId`.

**Corps de la requête :**
```json
{
  "toAccountId": "uuid-compte-destinataire",
  "amount": 15000,
  "description": "Remboursement loyer"
}
```

**Réponse 200 :**
```json
{
  "success": true,
  "transaction": {
    "type": "transfert",
    "fromAccountNumber": "CM111...",
    "toAccountNumber": "CM222...",
    ...
  },
  "fromBalance": 50000,
  "toBalance": 30000
}
```

| Cas d'erreur                         | Code |
|--------------------------------------|------|
| Montant ≤ 0                          | 400  |
| Compte source introuvable            | 404  |
| Solde insuffisant                    | 400  |
| Compte destinataire introuvable      | 404  |
| Virement vers le même compte         | 400  |

---

#### `GET /api/transactions/:id/transactions` — Historique d'un compte `[protect]`

**Paramètres de requête (query params) :**

| Paramètre | Type   | Description                         | Défaut |
|-----------|--------|-------------------------------------|--------|
| page      | number | Numéro de page                      | 1      |
| limit     | number | Résultats par page                  | 50     |
| type      | string | Filtre par type (`depot`, `retrait`, `transfert`) | — |
| startDate | string | Date de début `YYYY-MM-DD`          | —      |
| endDate   | string | Date de fin `YYYY-MM-DD`            | —      |

**Exemple :**
```
GET /api/transactions/uuid/transactions?type=depot&startDate=2026-01-01&endDate=2026-06-30
```

**Réponse 200 :**
```json
{
  "success": true,
  "transactions": [ { ... }, { ... } ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

| Cas d'erreur       | Code |
|--------------------|------|
| Compte introuvable | 404  |

---

#### `GET /api/transactions/all` — Toutes mes transactions `[protect]`

Retourne toutes les transactions de tous les comptes de l'utilisateur connecté.

**Paramètres :** `page`, `limit`

**Réponse 200 :** même format que ci-dessus, avec `include: account`.

---

### 5.4 Banques — `/api/banks`

---

#### `GET /api/banks` — Liste des banques actives `[protect]`

Retourne uniquement les banques avec `status = 'actif'`, triées par nom.

**Réponse 200 :**
```json
{
  "success": true,
  "banks": [
    { "id": "uuid", "name": "BIREC Central Bank", "code": "BNK001", "city": "Yaoundé", ... }
  ]
}
```

---

#### `GET /api/banks/all` — Toutes les banques `[admin]`

Retourne toutes les banques (actives et inactives) avec le nombre de comptes associés.

**Réponse 200 :**
```json
{
  "success": true,
  "banks": [
    {
      "id": "uuid",
      "name": "BIREC Central Bank",
      "accountCount": 15,
      "activeCount": 14,
      ...
    }
  ]
}
```

---

#### `GET /api/banks/:id` — Détail d'une banque `[admin]`

Inclut la liste des comptes associés.

**Réponse 200 :**
```json
{
  "success": true,
  "bank": {
    "id": "uuid",
    "name": "...",
    "accounts": [
      { "id": "uuid", "accountNumber": "CM...", "type": "compte_courant", "balance": "50000.00" }
    ]
  }
}
```

---

#### `POST /api/banks` — Créer une banque `[admin]`

**Corps de la requête :**
```json
{
  "name": "Afriland First Bank",
  "code": "AFB001",
  "email": "contact@afriland.cm",
  "phone": "+237 222 234 500",
  "city": "Yaoundé",
  "country": "Cameroon",
  "description": "Première banque camerounaise"
}
```

**Réponse 201 :** `{ "success": true, "bank": { ... } }`

---

#### `PUT /api/banks/:id` — Modifier une banque `[admin]`

**Corps de la requête :** même structure que la création + champ `status`.

| Cas d'erreur       | Code |
|--------------------|------|
| Banque introuvable | 404  |

---

#### `DELETE /api/banks/:id` — Supprimer une banque `[admin]`

| Cas d'erreur                          | Code |
|---------------------------------------|------|
| Banque introuvable                    | 404  |
| La banque a des comptes associés      | 400  |

---

### 5.5 Administration — `/api/admin`

Toutes les routes requièrent `protect + authorize('admin')`.

---

#### `GET /api/admin/stats` — Tableau de bord

**Réponse 200 :**
```json
{
  "success": true,
  "stats": {
    "userCount": 42,
    "bankCount": 5,
    "accountCount": 87,
    "txCount": 1203,
    "monthlyTx": 145,
    "totalBalance": 125000000,
    "txByType": [
      { "type": "depot", "count": "450" },
      { "type": "retrait", "count": "380" }
    ]
  },
  "recentTx": [ { ... } ]
}
```

---

#### `GET /api/admin/users` — Liste des utilisateurs

**Paramètres :** `page`, `limit`, `search` (prénom, nom, email)

**Exemple :** `GET /api/admin/users?search=Jean&page=1&limit=20`

**Réponse 200 :**
```json
{
  "success": true,
  "users": [
    {
      "id": "uuid",
      "firstName": "Jean",
      "email": "jean@example.cm",
      "role": "user",
      "isActive": true,
      "accounts": [ { "id": "uuid", "balance": "50000.00", ... } ]
    }
  ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```

---

#### `PUT /api/admin/users/:id/toggle` — Activer/Suspendre un utilisateur

Inverse la valeur de `isActive`. Ne fonctionne pas sur un compte admin.

**Réponse 200 :**
```json
{
  "success": true,
  "isActive": false,
  "message": "Compte suspendu"
}
```

| Cas d'erreur                 | Code |
|------------------------------|------|
| Utilisateur introuvable      | 404  |
| Cible est un admin           | 400  |

---

#### `PUT /api/admin/users/:id/role` — Changer le rôle

**Corps de la requête :** `{ "role": "admin" }` ou `{ "role": "user" }`

**Réponse 200 :** `{ "success": true, "message": "Rôle mis à jour : admin" }`

| Cas d'erreur                 | Code |
|------------------------------|------|
| Rôle invalide                | 400  |
| Utilisateur introuvable      | 404  |

---

#### `GET /api/admin/accounts` — Tous les comptes

**Paramètres :** `page`, `limit`, `bankId` (filtre par banque)

Inclut les infos user et banque associées.

---

#### `GET /api/admin/transactions` — Toutes les transactions

**Paramètres :** `page`, `limit`

Inclut le numéro de compte et le nom du titulaire.

---

## 6. Codes d'erreur standard

| Code | Signification                              |
|------|--------------------------------------------|
| 200  | Succès                                     |
| 201  | Ressource créée                            |
| 400  | Requête invalide (validation, règle métier)|
| 401  | Non authentifié (token manquant/invalide)  |
| 403  | Non autorisé (rôle insuffisant)            |
| 404  | Ressource introuvable                      |
| 500  | Erreur serveur interne                     |

### Format d'erreur uniforme

```json
{
  "success": false,
  "message": "Description de l'erreur"
}
```

Pour les erreurs de validation Sequelize :
```json
{
  "success": false,
  "message": "Erreur de validation",
  "errors": ["Le prénom est requis", "Email invalide"]
}
```

---

## 7. Installation et lancement

### Prérequis

- Node.js ≥ 18.0.0
- npm

### Installation

```bash
git clone https://github.com/merimedjomoyondjio-max/api_bank.git
cd api_bank
npm install
```

### Fichier `.env`

Créer un fichier `.env` à la racine :

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=votre_secret_jwt_tres_securise
JWT_EXPIRE=7d
```

### Démarrage

```bash
# Production
npm start

# Développement (rechargement automatique)
npm run dev
```

Le serveur démarre sur `http://localhost:3000`.  
La base de données SQLite est créée automatiquement dans `data/database.sqlite`.

### Premier démarrage

Au premier lancement, le serveur crée automatiquement :

- **Admin par défaut :** `admin@birec.cm` / `Admin123!`
- **Banque par défaut :** BIREC Central Bank (code : BNK001)

> Changez le mot de passe admin immédiatement après le premier déploiement.

---

## 8. Tests et couverture

### Lancer les tests

```bash
# Tous les tests
npm test

# Avec rapport de couverture
npm run test:coverage

# Mode watch (développement)
npm run test:watch
```

### Architecture des tests

Les tests utilisent **Jest + Supertest** sur une base SQLite **`:memory:`** isolée (jamais le fichier de prod).

```
NODE_ENV=test → SQLite :memory: (database.js)
               ↓
tests/setup.js → sync({ force: true }) avant chaque fichier de test
               ↓
tests/helpers.js → api(), registerUser(), registerAdmin(), createBank(), createAccount()
```

**Règles d'isolation :**
- Chaque fichier de test repart d'une base vide (`sync({ force: true })`)
- Les tests s'exécutent en série (`--runInBand`) pour éviter les conflits SQLite
- `--forceExit` pour fermer les connexions SQLite après les tests

### Résultats actuels

```
Test Suites: 6 passed
Tests:       149 passed
Coverage:    100% statements | 100% branches | 100% functions | 100% lines
```

| Fichier de test        | Nombre de tests | Ce qui est couvert                              |
|------------------------|----------------|--------------------------------------------------|
| auth.test.js           | 16             | register, login, profile, update, change-password|
| accounts.test.js       | 13             | create, list, detail, balance, close             |
| transactions.test.js   | 20             | deposit, withdraw, transfer, history             |
| banks.test.js          | 16             | CRUD banques + permissions                       |
| admin.test.js          | 25             | stats, users, accounts, transactions             |
| coverage.test.js       | 57             | catch blocks, branches, edge cases, 404s          |

### Stratégie pour 100% de couverture

- **Catch blocks** : `jest.spyOn(Model, 'méthode').mockRejectedValueOnce(new Error('DB crash'))`
- **Branches `||`** : tests avec et sans les paramètres optionnels
- **Branches `if`** : tests des chemins 404, 400, et succès
- **Code non atteignable** : commentaires `/* istanbul ignore else/next */`
- **Attention Sequelize v6** : `findByPk → findOne → findAll` en interne — ne jamais mocker `User.findAll` sur des routes protégées, mocker `User.count` à la place

---

## 9. Déploiement Render

Le projet inclut un fichier `render.yaml` pour le déploiement automatique sur [Render.com](https://render.com).

### render.yaml

```yaml
services:
  - type: web
    name: birec-bank-api
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_EXPIRE
        value: 7d
```

### Déploiement manuel

```bash
git add .
git commit -m "Deploy to Render"
git push origin main
```

Render déclenche automatiquement un nouveau déploiement à chaque push sur `main`.

### Notes importantes

- SQLite sur Render : les données sont **ephémères** (réinitialisées à chaque déploiement). Pour la production, migrer vers PostgreSQL.
- Les variables d'environnement `JWT_SECRET` etc. doivent être configurées dans le dashboard Render.

---

## 10. Frontend SPA

Le projet embarque un frontend SPA (Single Page Application) servi statiquement depuis `public/`.

### Caractéristiques

- **Technologie :** HTML5 / CSS3 / JavaScript vanilla
- **Design :** thème orange & blanc, responsive
- **Icônes :** Lucide Icons
- **Devise :** FCFA (Franc CFA — XAF)
- **Localisation :** Cameroun / interface en anglais

### Route catch-all

```js
// app.js
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
```

Toutes les routes non-API renvoient `index.html`. Le SPA gère sa propre navigation côté client.

### Sections du frontend

1. **Dashboard** — Solde total, graphiques, transactions récentes
2. **Comptes** — Liste, création, fermeture
3. **Transactions** — Dépôt, retrait, virement, historique avec filtres
4. **Banques** — Liste des banques partenaires
5. **Profil** — Informations personnelles, changement de mot de passe
6. **Administration** (admin uniquement) — Stats, gestion utilisateurs

---

## 11. Variables d'environnement

| Variable     | Obligatoire | Description                      | Exemple                |
|--------------|-------------|----------------------------------|------------------------|
| `NODE_ENV`   | Non         | Environnement (`development`, `production`, `test`) | `production` |
| `PORT`       | Non         | Port d'écoute (défaut : 3000)    | `3000`                 |
| `JWT_SECRET` | **Oui**     | Clé secrète pour signer les JWT  | `un-secret-tres-long`  |
| `JWT_EXPIRE` | Non         | Durée de vie du token (défaut : selon config) | `7d` |

> En mode `test`, `NODE_ENV=test` force l'utilisation de SQLite `:memory:` et ne modifie jamais la base de données de production.

---

## 12. Données par défaut (seed)

À chaque démarrage, `server.js` vérifie et crée si absents :

### Admin

| Champ    | Valeur               |
|----------|----------------------|
| Email    | `admin@birec.cm`     |
| Password | `Admin123!`          |
| Rôle     | `admin`              |
| Prénom   | Super                |
| Nom      | Admin                |
| Téléphone | +237 222 000 000   |

### Banque centrale

| Champ       | Valeur                                         |
|-------------|------------------------------------------------|
| Nom         | BIREC Central Bank                             |
| Code        | BNK001                                         |
| Email       | contact@birec.cm                               |
| Téléphone   | +237 222 000 001                               |
| Ville       | Yaoundé                                        |
| Pays        | Cameroon                                       |
| Description | Central bank of the BIREC Group — Cameroon     |

---

## Annexe — Glossaire

| Terme               | Signification                                                  |
|---------------------|----------------------------------------------------------------|
| XAF                 | Franc CFA d'Afrique centrale (monnaie du Cameroun)            |
| UUID                | Identifiant unique universel (format : `xxxxxxxx-xxxx-4xxx-...`)|
| JWT                 | JSON Web Token — standard pour l'authentification stateless   |
| Sequelize           | ORM Node.js pour SQL (SQLite, PostgreSQL, MySQL...)            |
| SQLite              | Base de données embarquée dans un seul fichier `.sqlite`       |
| `:memory:`          | Base SQLite en mémoire RAM, utilisée pour les tests            |
| Transaction SQL     | Opération atomique (tout ou rien, avec rollback si erreur)     |
| Middleware          | Fonction Express exécutée entre la requête et le contrôleur    |
| bcrypt              | Algorithme de hachage pour les mots de passe                   |
| CORS                | Cross-Origin Resource Sharing — politique d'accès cross-domain |
| SPA                 | Single Page Application — frontend qui gère sa navigation      |
| Seed                | Données initiales insérées au démarrage                        |

---

*Documentation générée le 17 juin 2026 — BIREC Bank API v1.0.0*
