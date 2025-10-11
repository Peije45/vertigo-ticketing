<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Administration - Vertigo RP Dashboard</title>
    <!-- ✅ CHANGEMENT : Utiliser auth-admin.js au lieu de auth.js -->
    <script src="/js/auth-admin.js"></script>
    <style>
        :root {
            --discord-dark: #2b2d31;
            --discord-darker: #1e1f22;
            --discord-light: #313338;
            --discord-hover: #404249;
            --discord-blurple: #5865f2;
            --text-primary: #f2f3f5;
            --text-secondary: #b5bac1;
            --text-muted: #80848e;
            --success: #3ba55d;
            --danger: #ed4245;
            --warning: #faa61a;
            --info: #00b0f4;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: var(--discord-darker);
            color: var(--text-primary);
        }

        /* Header */
        .header {
            background: var(--discord-dark);
            padding: 1rem 2rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }

        .logo {
            font-size: 1.5rem;
            font-weight: bold;
            background: linear-gradient(45deg, #9146ff, #5865f2);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .nav-links {
            display: flex;
            gap: 1rem;
        }

        .nav-link {
            padding: 0.5rem 1rem;
            background: var(--discord-light);
            border-radius: 6px;
            color: var(--text-secondary);
            text-decoration: none;
            transition: all 0.2s;
        }

        .nav-link:hover {
            background: var(--discord-hover);
            color: var(--text-primary);
        }

        /* Main Container */
        .container {
            max-width: 1400px;
            margin: 2rem auto;
            padding: 0 2rem;
        }

        .page-header {
            margin-bottom: 2rem;
        }

        .page-title {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }

        .page-subtitle {
            color: var(--text-secondary);
            font-size: 0.95rem;
        }

        /* Stats Cards */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: var(--discord-dark);
            padding: 1.5rem;
            border-radius: 8px;
            border-left: 3px solid var(--discord-blurple);
        }

        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: var(--text-primary);
        }

        .stat-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }

        /* Actions Bar */
        .actions-bar {
            background: var(--discord-dark);
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            display: flex;
            gap: 1rem;
            align-items: center;
            flex-wrap: wrap;
        }

        .btn {
            padding: 0.65rem 1.25rem;
            background: var(--discord-light);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: var(--text-primary);
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.9rem;
            font-weight: 500;
        }

        .btn:hover {
            background: var(--discord-hover);
        }

        .btn-primary {
            background: var(--discord-blurple);
            border-color: var(--discord-blurple);
        }

        .btn-primary:hover {
            background: #4752c4;
        }

        .btn-success {
            background: var(--success);
            border-color: var(--success);
        }

        .btn-danger {
            background: var(--danger);
            border-color: var(--danger);
        }

        /* Table */
        .table-container {
            background: var(--discord-dark);
            border-radius: 8px;
            overflow: hidden;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        thead {
            background: var(--discord-light);
        }

        th {
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            color: var(--text-secondary);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        td {
            padding: 1rem;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        tbody tr:hover {
            background: var(--discord-light);
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
        }

        .user-details {
            display: flex;
            flex-direction: column;
        }

        .user-name {
            font-weight: 600;
            color: var(--text-primary);
        }

        .user-id {
            font-size: 0.75rem;
            color: var(--text-muted);
            font-family: 'Courier New', monospace;
        }

        .badge {
            display: inline-block;
            padding: 0.25rem 0.6rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
        }

        .badge-success {
            background: var(--success);
            color: white;
        }

        .badge-danger {
            background: var(--danger);
            color: white;
        }

        .badge-warning {
            background: var(--warning);
            color: var(--discord-darker);
        }

        .badge-super {
            background: linear-gradient(45deg, #9146ff, #5865f2);
            color: white;
        }

        .roles-list {
            display: flex;
            gap: 0.25rem;
            flex-wrap: wrap;
        }

        .role-badge {
            padding: 0.15rem 0.5rem;
            border-radius: 8px;
            font-size: 0.7rem;
            background: var(--discord-light);
            color: var(--text-secondary);
        }

        .actions-cell {
            display: flex;
            gap: 0.5rem;
        }

        .btn-sm {
            padding: 0.4rem 0.75rem;
            font-size: 0.8rem;
        }

        /* Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            background: var(--discord-dark);
            width: 90%;
            max-width: 600px;
            border-radius: 8px;
            overflow: hidden;
        }

        .modal-header {
            padding: 1.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-title {
            font-size: 1.3rem;
            font-weight: 600;
        }

        .close-btn {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.5rem;
        }

        .close-btn:hover {
            color: var(--text-primary);
        }

        .modal-body {
            padding: 1.5rem;
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-label {
            display: block;
            margin-bottom: 0.5rem;
            color: var(--text-secondary);
            font-size: 0.9rem;
            font-weight: 500;
        }

        .form-input {
            width: 100%;
            padding: 0.75rem;
            background: var(--discord-light);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.95rem;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--discord-blurple);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem;
            background: var(--discord-light);
            border-radius: 6px;
            cursor: pointer;
        }

        .checkbox-group input[type="checkbox"] {
            width: 20px;
            height: 20px;
            cursor: pointer;
        }

        .roles-checkboxes {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
        }

        .modal-footer {
            padding: 1.5rem;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
        }

        .alert {
            padding: 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
        }

        .alert-success {
            background: rgba(59, 165, 93, 0.2);
            border: 1px solid var(--success);
            color: var(--success);
        }

        .alert-error {
            background: rgba(237, 66, 69, 0.2);
            border: 1px solid var(--danger);
            color: var(--danger);
        }

        .loading {
            text-align: center;
            padding: 3rem;
            color: var(--text-secondary);
        }

        .spinner {
            border: 3px solid var(--discord-light);
            border-top: 3px solid var(--discord-blurple);
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <!-- Header -->
    <header class="header">
        <div class="header-left">
            <div class="logo">👑 ADMIN PANEL</div>
            <div class="nav-links">
                <a href="/" class="nav-link">📊 Dashboard</a>
                <a href="/admin.html" class="nav-link">⚙️ Administration</a>
            </div>
        </div>
    </header>

    <!-- Main Container -->
    <div class="container">
        <!-- Page Header -->
        <div class="page-header">
            <h1 class="page-title">Gestion des Utilisateurs</h1>
            <p class="page-subtitle">Gérez les accès et les permissions des membres du staff</p>
        </div>

        <!-- Stats -->
        <div class="stats-grid" id="statsGrid">
            <div class="stat-card">
                <div class="stat-number">-</div>
                <div class="stat-label">Utilisateurs Total</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">-</div>
                <div class="stat-label">Avec Accès Dashboard</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">-</div>
                <div class="stat-label">Super Admins</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">-</div>
                <div class="stat-label">Actifs (7 derniers jours)</div>
            </div>
        </div>

        <!-- Actions Bar -->
        <div class="actions-bar">
            <button class="btn btn-primary" onclick="openAddUserModal()">
                ➕ Ajouter un utilisateur
            </button>
            <button class="btn" onclick="loadUsers()">
                🔄 Actualiser
            </button>
        </div>

        <!-- Users Table -->
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Utilisateur</th>
                        <th>Rôles</th>
                        <th>Accès Dashboard</th>
                        <th>Statut</th>
                        <th>Dernière connexion</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="usersTableBody">
                    <tr>
                        <td colspan="6">
                            <div class="loading">
                                <div class="spinner"></div>
                                <div>Chargement des utilisateurs...</div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Modal Add User -->
    <div class="modal" id="addUserModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Ajouter un utilisateur</h2>
                <button class="close-btn" onclick="closeAddUserModal()">✖</button>
            </div>
            <div class="modal-body">
                <div id="addUserAlert"></div>
                
                <div class="form-group">
                    <label class="form-label">Discord ID *</label>
                    <input 
                        type="text" 
                        class="form-input" 
                        id="discordIdInput" 
                        placeholder="343134692444209153"
                    >
                    <small style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.25rem; display: block;">
                        Pour obtenir un Discord ID : Mode Développeur → Clic droit sur l'utilisateur → Copier l'identifiant
                    </small>
                </div>

                <div class="form-group">
                    <label class="checkbox-group">
                        <input type="checkbox" id="canAccessCheckbox">
                        <span>Donner accès au dashboard</span>
                    </label>
                </div>

                <div class="form-group">
                    <label class="form-label">Rôles</label>
                    <div class="roles-checkboxes" id="rolesCheckboxes">
                        <!-- Rôles chargés dynamiquement -->
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="closeAddUserModal()">Annuler</button>
                <button class="btn btn-primary" onclick="addUser()">Ajouter</button>
            </div>
        </div>
    </div>

    <!-- Modal Edit User -->
    <div class="modal" id="editUserModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">Modifier l'utilisateur</h2>
                <button class="close-btn" onclick="closeEditUserModal()">✖</button>
            </div>
            <div class="modal-body">
                <div id="editUserAlert"></div>
                
                <input type="hidden" id="editUserId">
                
                <div class="form-group">
                    <label class="form-label">Utilisateur</label>
                    <div id="editUserInfo"></div>
                </div>

                <div class="form-group">
                    <label class="checkbox-group">
                        <input type="checkbox" id="editCanAccessCheckbox">
                        <span>Accès au dashboard</span>
                    </label>
                </div>

                <div class="form-group">
                    <label class="checkbox-group">
                        <input type="checkbox" id="editIsActiveCheckbox">
                        <span>Compte actif</span>
                    </label>
                </div>

                <div class="form-group">
                    <label class="form-label">Rôles</label>
                    <div class="roles-checkboxes" id="editRolesCheckboxes">
                        <!-- Rôles chargés dynamiquement -->
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn" onclick="closeEditUserModal()">Annuler</button>
                <button class="btn btn-primary" onclick="saveUser()">Enregistrer</button>
            </div>
        </div>
    </div>

    <script src="/js/admin.js"></script>
</body>
</html>
