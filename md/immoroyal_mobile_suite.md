# ImmoRoyal Mobile — Fiche de reprise projet

## Vue d'ensemble

Application mobile Flutter pour **ImmoRoyal**, plateforme immobilière du Bénin.
Backend : Node.js/Express existant avec API REST `/api/v1` + JWT.

---

## Stack technique

### Flutter (mobile)
- Flutter 3.x / Dart 3.x
- State management : **Provider**
- Navigation : **GoRouter**
- HTTP : **Dio** avec intercepteur JWT automatique
- Stockage sécurisé : **flutter_secure_storage**
- Images réseau : **cached_network_image**
- Vidéo : **video_player** + **chewie**
- Upload médias : **image_picker**
- Polices : **google_fonts** (DM Sans)
- UI : shimmer, flutter_svg

### Node.js (backend)
- Express + EJS (web) + JSON flat files (`data/`)
- API REST `/api/v1` avec middleware JWT (`middleware/jwt.js`)
- Upload médias : Multer (`uploads/annonces/`)
- Miniatures vidéo : **fluent-ffmpeg** + **@ffmpeg-installer/ffmpeg**
- Auth web : express-session + bcrypt
- Auth mobile : jsonwebtoken (JWT 7 jours)

---

## Architecture du projet Flutter

```
lib/
├── main.dart
├── app.dart                        # GoRouter + MultiProvider
├── core/
│   ├── theme/
│   │   ├── colors.dart             # Palette or/noir/blanc
│   │   ├── text_styles.dart        # DM Sans — AppText
│   │   └── theme.dart              # ThemeData Material 3
│   ├── constants/api_constants.dart
│   ├── network/dio_client.dart     # Dio + intercepteur JWT
│   └── utils/
│       ├── formatters.dart         # FCFA, dates, prix
│       └── guard_auth.dart         # Redirection login si non connecté
├── models/
│   ├── annonce.dart                # AnnonceModel + mediasUnifies + thumbnail
│   ├── recherche.dart              # RechercheModel
│   ├── user.dart                   # UserModel + initiales
│   └── message.dart                # MessageModel + ConversationModel
├── services/
│   ├── annonces_service.dart
│   ├── recherches_service.dart
│   └── auth_service.dart
├── providers/
│   ├── auth_provider.dart          # AuthStatus + login/logout/updateUser
│   ├── annonces_provider.dart      # Pagination + filtres + infinite scroll
│   └── recherches_provider.dart
├── screens/
│   ├── splash/splash_screen.dart   # Animation + check JWT → /home
│   ├── auth/
│   │   ├── login_screen.dart
│   │   └── register_screen.dart
│   ├── home/home_screen.dart       # Hero + catégories + annonces + recherches
│   ├── annonces/
│   │   ├── list_screen.dart        # Filtres + infinite scroll
│   │   ├── details_screen.dart     # Galerie + miniatures + contact sticky
│   │   ├── create_screen.dart      # Wizard 4 étapes + upload médias ✅
│   │   └── edit_screen.dart        # Wizard pré-rempli + médias existants ✅
│   ├── recherches/
│   │   ├── list_screen.dart
│   │   ├── details_screen.dart     # Contact sticky
│   │   ├── create_screen.dart      # Wizard 4 étapes ✅
│   │   └── edit_screen.dart        # ✅
│   ├── messages/
│   │   ├── conversations_screen.dart
│   │   └── chat_screen.dart        # Polling 5s (WebSocket à migrer)
│   └── profile/
│       ├── dashboard_screen.dart   # Stats + actions + dernières annonces
│       ├── edit_profile_screen.dart
│       ├── annonces_screen.dart    # Mes annonces + actions
│       ├── recherches_screen.dart  # Mes recherches + actions
│       └── public_screen.dart      # Profil public visible sans connexion
└── widgets/
    ├── common/
    │   ├── app_shell.dart          # BottomNav 5 tabs + historique navigation
    │   ├── app_navbar.dart         # ImmoRoyalAppBar + SliverAppBar
    │   ├── gold_button.dart        # Filled / Outlined / Ghost
    │   ├── loading_shimmer.dart    # Skeleton cards
    │   └── media_grid.dart         # Galerie + slider plein écran + VideoPlayer
    ├── annonces/
    │   └── annonce_card.dart       # Card avec badges, miniature, actions
    └── recherches/
        └── recherche_card.dart
```

---

## Routing (app.dart)

```
/splash           → SplashScreen (toujours, vérifie JWT)
/login            → LoginScreen
/register         → RegisterScreen

# Hors ShellRoute (pas de BottomNav)
/annonces/creer           → CreateAnnonceScreen
/annonces/:id             → AnnonceDetailsScreen
/annonces/:id/modifier    → EditAnnonceScreen
/recherches/creer         → CreateRechercheScreen
/recherches/:id           → RechercheDetailsScreen
/recherches/:id/modifier  → EditRechercheScreen
/messages/:conversationId → ChatScreen
/profil/modifier          → EditProfileScreen
/profil/annonces          → ProfileAnnoncesScreen
/profil/recherches        → ProfileRecherchesScreen
/profil/public/:id        → ProfilePublicScreen

# ShellRoute (avec BottomNav)
/home       → HomeScreen
/annonces   → AnnoncesListScreen
/recherches → RecherchesListScreen
/messages   → ConversationsScreen
/profil     → ProfileDashboardScreen
```

---

## Authentification

- **Web** : express-session (cookie)
- **Mobile** : JWT stocké dans `flutter_secure_storage` (clé `immoroyal_jwt`)
- Token valide **7 jours**, pas de refresh token implémenté
- `guardAuth(context)` → redirige vers `/login` si non connecté
- Navigation libre sans connexion (splash → /home toujours)
- Connexion requise : publier annonce, envoyer message, accéder profil, créer recherche

---

## Médias (annonces)

### Côté serveur
- Upload via Multer → `uploads/annonces/`
- Vidéos → miniature générée par **ffmpeg** : `thumb_xxxx.jpg`
- La miniature est ajoutée en **première position** dans `photos[]`
- Max 10 médias, max 3 vidéos, max 50Mo par vidéo

### Côté Flutter
- `annonce.thumbnail` → retourne `thumb_xxxx.jpg` si vidéo présente, sinon `photos.first`
- `annonce.mediasUnifies` → liste `[{url, type, videoUrl?}]` vidéos d'abord
- `hasVideo` → true si `videos.isNotEmpty`
- Galerie plein écran : `_GalleryModal` avec `PageView` + `Chewie` pour les vidéos
- Pinch-to-zoom sur les photos via `InteractiveViewer`

### Script de migration
```bash
node scripts/generer_thumbs.js
# Génère les miniatures pour toutes les annonces existantes sans thumb
```

---

## Charte graphique

```dart
kGold      = Color(0xFFD4AF37)  // couleur principale
kGoldLight = Color(0xFFE8C84A)
kGoldDark  = Color(0xFFB8960C)
kGoldBg    = Color(0xFFFFF9E6)  // fond doré léger
kBlack     = Color(0xFF1C1C1E)
kDark      = Color(0xFF2C2C2E)
kNavBar    = Color(0xFF1A1A1A)  // navbar noire
kGrey      = Color(0xFF6B6B6B)
kGreyLight = Color(0xFFF5F5F5)
kGreyBorder= Color(0xFFE0E0E0)
kWhite     = Color(0xFFFFFFFF)
kViolet    = Color(0xFF6366F1)  // badge recherche
kGreen     = Color(0xFF28A745)  // WhatsApp / fonds dispo
kRed       = Color(0xFFDC3545)  // suppression / erreur
kActiveGreen = Color(0xFF28A745)
```

**Police** : DM Sans (Google Fonts) pour tout le texte
**Logos** : `assets/images/IMMOROYAL_2_1.png` (fond noir), `IMMOROYAL_1_1.png` (fond blanc), `IMMOROYAL_4_1.png` (version utilisée dans l'app)

---

## Ce qui est fait ✅

- [x] Splash screen + vérification JWT
- [x] Login / Register
- [x] Home : hero, catégories, annonces en vedette, dernières annonces, Je cherche, grille infinie
- [x] Liste annonces avec filtres (BottomSheet) + infinite scroll
- [x] Détail annonce : galerie, miniatures, infos financières, caractéristiques, contact sticky
- [x] Création annonce (wizard 4 étapes + upload médias)
- [x] Modification annonce (wizard pré-rempli + médias existants)
- [x] Liste recherches avec filtres
- [x] Détail recherche + contact
- [x] Création recherche (wizard 4 étapes)
- [x] Modification recherche
- [x] Messagerie : liste conversations + chat (polling 5s)
- [x] Profil dashboard : stats, actions, dernières annonces
- [x] Modifier profil
- [x] Mes annonces (CRUD complet)
- [x] Mes recherches (CRUD complet)
- [x] Profil public
- [x] Badges "À louer" / "À vendre" sur les cards
- [x] Navigation libre sans connexion
- [x] `guardAuth` sur les actions protégées
- [x] Miniatures vidéo générées par ffmpeg côté serveur
- [x] Script de migration `scripts/generer_thumbs.js`
- [x] Fix `typeTransaction` manquant sur les anciennes annonces (`scripts/fix_type_transaction.js`)

---

## Ce qui reste à faire ❌

### 1. StartConversationScreen (CRITIQUE)
Le bouton "Message" sur le détail annonce appelle `/messages/annonce/:annonceId` mais la route est commentée dans `app.dart`.

**À faire :**
- Décommenter la route dans `app.dart`
- Créer `StartConversationScreen` dans `chat_screen.dart` :

```dart
class StartConversationScreen extends StatefulWidget {
  final String annonceId;
  ...
  // Appelle POST /messages/annonce/:annonceId
  // Récupère l'id de la conversation
  // context.replace('/messages/$convId')
}
```

---

### 2. WebSocket (messages temps réel)
Actuellement le chat utilise un **polling toutes les 5 secondes**. Migrer vers Socket.io.

**Côté Node.js :**
```bash
npm install socket.io
```

```javascript
// Dans app.js
const { Server } = require('socket.io');
const http = require('http');
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('joinConversation', (convId) => socket.join(convId));
  socket.on('sendMessage', (data) => {
    // Sauvegarder le message en DB
    // Émettre à tous les participants
    io.to(data.convId).emit('newMessage', message);
  });
});

server.listen(PORT); // remplacer app.listen par server.listen
```

**Côté Flutter :**
```yaml
# pubspec.yaml
socket_io_client: ^2.0.3
```

```dart
// Dans chat_screen.dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket socket = IO.io('http://IP:3000', <String, dynamic>{
  'transports': ['websocket'],
  'autoConnect': false,
});

// Connexion + écoute
socket.connect();
socket.emit('joinConversation', conversationId);
socket.on('newMessage', (data) {
  setState(() => _messages.add(MessageModel.fromJson(data)));
  _scrollToBottom();
});

// Envoi
socket.emit('sendMessage', {'convId': conversationId, 'texte': texte});
```

---

### 3. Notifications push Firebase

**Côté Flutter :**
```yaml
firebase_core: ^2.27.0
firebase_messaging: ^14.7.19
```

```dart
// Dans main.dart
await Firebase.initializeApp();
FirebaseMessaging messaging = FirebaseMessaging.instance;
await messaging.requestPermission();
String? token = await messaging.getToken();
// Envoyer le token au serveur pour l'associer à l'utilisateur
```

**Côté Node.js :**
```bash
npm install firebase-admin
```

```javascript
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Envoyer une notification
admin.messaging().send({
  token: userFcmToken,
  notification: {
    title: 'Nouveau message',
    body: 'Vous avez reçu un message',
  },
});
```

**Fichiers à créer :**
- `google-services.json` dans `android/app/`
- `GoogleService-Info.plist` dans `ios/Runner/`
- Endpoint `POST /api/v1/fcm-token` pour enregistrer le token

---

### 4. Endpoint DELETE recherche manquant

Dans `routes/api.js`, ajouter :

```javascript
router.delete('/recherches/:id', authJWT, (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche) return res.status(404).json({ error: 'Recherche introuvable.' });
  if (recherche.auteurId !== req.user.id)
    return res.status(403).json({ error: 'Accès interdit.' });
  db.update('recherches', req.params.id, { actif: false });
  res.json({ success: true });
});
```

---

### 5. Persistance locale (cache offline)

**Package recommandé : `hive`**
```yaml
hive: ^2.2.3
hive_flutter: ^1.1.0
```

Mettre en cache :
- Les annonces de la page d'accueil
- Les conversations
- Les données du profil

---

### 6. Refresh JWT

Le token expire après 7 jours. Actuellement si le token expire, l'utilisateur voit des erreurs 401.

**Solution :** dans `dio_client.dart`, dans le `onError`, si 401 → afficher un dialog "Session expirée" → rediriger vers `/login`.

```dart
onError: (error, handler) async {
  if (error.response?.statusCode == 401) {
    await _storage.delete(key: ApiConstants.jwtKey);
    // Naviguer vers /login via un GlobalKey<NavigatorState>
  }
  return handler.next(error);
},
```

---

### 7. Bouton retour Android (MIUI)

Le `BackButtonListener` et `PopScope` ne fonctionnent pas sur Xiaomi/MIUI — MIUI intercepte le bouton retour au niveau natif avant Flutter.

**Solution tentée :** `MethodChannel` dans `MainActivity.kt` → non concluant.

**À investiguer :**
- `android:enableOnBackInvokedCallback="true"` dans `AndroidManifest.xml`
- Ou accepter le comportement par défaut sur MIUI

---

### 8. Partage d'annonce

Le bouton share est présent dans `details_screen.dart` mais vide.

```dart
// Package à utiliser
share_plus: ^7.0.0

// Implémentation
import 'package:share_plus/share_plus.dart';

onTap: () {
  Share.share(
    'Découvrez cette annonce sur ImmoRoyal : '
    'http://IP:3000/annonces/${annonce.id}',
  );
},
```

---

### 9. Nettoyage avant production

- Supprimer tous les `print()` de debug (notamment dans `app_shell.dart`)
- Configurer `API_BASE_URL` via variable d'environnement (`.env`)
- Activer `--release` pour le build de production : `flutter build apk --release`

---

## Points d'attention importants

### Rétrocompatibilité prix
Le champ `loyer` est conservé pour les anciennes annonces. `getPrixAffiche()` retourne `prix || loyer || 0`. Côté Flutter : `annonce.prixAffiche` gère ça automatiquement.

### typeTransaction manquant
Les anciennes annonces n'avaient pas `typeTransaction`. Corriger avec :
```bash
node scripts/fix_type_transaction.js
```

### Miniatures vidéo
Les annonces créées **avant** l'installation de ffmpeg n'ont pas de miniatures. Générer avec :
```bash
node scripts/generer_thumbs.js
```

### Navigation libre
Le splash redirige **toujours** vers `/home`, jamais vers `/login`. La connexion est demandée uniquement au moment d'une action protégée via `guardAuth(context)`.

### AndroidManifest.xml
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<application android:usesCleartextTraffic="true">
```
Indispensable pour les requêtes HTTP (non HTTPS) en développement.

---

## Commandes utiles

```bash
# Flutter
flutter pub get          # installer les dépendances
flutter run              # lancer en debug
flutter run -d emulator  # lancer sur émulateur
flutter build apk        # build release Android

# Node.js
node app.js                          # démarrer le serveur
node scripts/generer_thumbs.js       # générer les miniatures vidéo
node scripts/fix_type_transaction.js # corriger typeTransaction manquant

# Passer l'URL API à la compilation Flutter
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:3000/api/v1
```

---

## Structure des données principales

### AnnonceModel (Dart)
```dart
// Champs clés
prixAffiche  → prix > 0 ? prix : loyer  // rétrocompat
thumbnail    → thumb_xxx.jpg si vidéo, sinon photos.first
mediasUnifies → [{url, type, videoUrl?}] vidéos d'abord
hasVideo     → videos.isNotEmpty
isLocation   → typeTransaction == 'location'
isTerrain    → typeBien == 'Terrain'
```

### Annonce JSON (Node.js)
```json
{
  "id": "uuid",
  "titre": "string",
  "typeBien": "Appartement meublé|Maison|Terrain|...",
  "typeTransaction": "location|vente",
  "ville": "string",
  "quartier": "string",
  "prix": 0,
  "loyer": 0,
  "dureeLocation": "heure|6h|12h|24h|semaine|mois",
  "photos": ["/uploads/annonces/thumb_xxx.jpg", "/uploads/annonces/xxx.jpg"],
  "videos": ["/uploads/annonces/xxx.mp4"],
  "auteurId": "uuid",
  "actif": true,
  "suspendu": false,
  "enAvant": false
}
```

---

*Dernière mise à jour : juillet 2026*
*Développeur : Prince Steed Noumon Dossou*