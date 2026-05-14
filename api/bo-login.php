<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody ?: '{}', true);

$email = trim((string) ($payload['email'] ?? ''));
$password = (string) ($payload['password'] ?? '');

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email et mot de passe requis']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Identifiants incorrects']);
    exit;
}

try {
    $config = require __DIR__ . '/../../eval/app/config/parameters.php';
    $params = $config['parameters'] ?? [];

    $host = (string) ($params['database_host'] ?? '127.0.0.1');
    $port = (string) ($params['database_port'] ?? '');
    $dbName = (string) ($params['database_name'] ?? '');
    $dbUser = (string) ($params['database_user'] ?? '');
    $dbPassword = (string) ($params['database_password'] ?? '');
    $prefix = (string) ($params['database_prefix'] ?? 'ps_');
    $cookieKey = (string) ($params['cookie_key'] ?? '');

    $dsn = 'mysql:host=' . $host . ($port !== '' ? ';port=' . $port : '') . ';dbname=' . $dbName . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $statement = $pdo->prepare(
        'SELECT id_employee, firstname, lastname, email, passwd
         FROM `' . str_replace('`', '', $prefix) . 'employee`
         WHERE email = :email AND active = 1
         LIMIT 1'
    );
    $statement->execute(['email' => $email]);
    $employee = $statement->fetch();

    if (!$employee) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Identifiants incorrects']);
        exit;
    }

    $storedHash = (string) $employee['passwd'];
    $isBcryptHash = str_starts_with($storedHash, '$2y$')
        || str_starts_with($storedHash, '$2a$')
        || str_starts_with($storedHash, '$2b$');

    $isPasswordValid = $isBcryptHash
        ? password_verify($password, $storedHash)
        : hash_equals(md5($cookieKey . $password), $storedHash);

    if (!$isPasswordValid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Identifiants incorrects']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'employee' => [
            'id' => (int) $employee['id_employee'],
            'email' => $employee['email'],
            'firstname' => $employee['firstname'],
            'lastname' => $employee['lastname'],
        ],
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
}
