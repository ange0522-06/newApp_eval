<?php

declare(strict_types=1);

require_once __DIR__ . '/prestashop-webservice.php';

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

function bo_cookie_key(): string
{
    $config = require __DIR__ . '/../../eval/app/config/parameters.php';
    $params = $config['parameters'] ?? [];

    return (string) ($params['cookie_key'] ?? '');
}

function bo_password_matches(string $password, string $storedHash, string $cookieKey): bool
{
    if ($storedHash === '') {
        return false;
    }

    if (str_starts_with($storedHash, '$') && password_verify($password, $storedHash)) {
        return true;
    }

    return $cookieKey !== '' && hash_equals(md5($cookieKey . $password), $storedHash);
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
    $employees = ps_list_full_nodes('employees', [
        'filter[email]' => ps_filter_value($email),
    ]);

    $employee = null;
    foreach ($employees as $candidate) {
        if (strcasecmp(ps_text($candidate, 'email'), $email) === 0 && ps_text($candidate, 'active') === '1') {
            $employee = $candidate;
            break;
        }
    }

    if (!$employee instanceof SimpleXMLElement) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Identifiants incorrects']);
        exit;
    }

    if (!bo_password_matches($password, ps_text($employee, 'passwd'), bo_cookie_key())) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Identifiants incorrects']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'employee' => [
            'id' => (int) ps_text($employee, 'id'),
            'email' => ps_text($employee, 'email'),
            'firstname' => ps_text($employee, 'firstname'),
            'lastname' => ps_text($employee, 'lastname'),
        ],
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur serveur: ' . $exception->getMessage(),
    ]);
}

