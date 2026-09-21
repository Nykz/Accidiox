<?php
// Emergency contacts for the rider app, scoped to the signed-in rider.
// Requests without a rider token read/write the legacy shared list
// (user_id IS NULL), so older installs keep working.
//   GET              -> this rider's contacts
//   POST {contacts}  -> replace this rider's list (first = primary)
//   POST {name, phone, is_primary} -> add one
//   DELETE {id} | {phone}
require_once __DIR__ . '/lib/bootstrap.php';

$rider = current_user($conn);
$uid = $rider && $rider['role'] === 'rider' ? (int) $rider['id'] : null;
// MySQL's null-safe equality lets one query serve both scopes.
$scope = "user_id <=> ?";

function contact_rows($conn, $scope, $uid) {
    return array_map(fn($r) => [
        "id" => (int) $r['id'],
        "name" => $r['name'],
        "phone" => normalize_phone($r['phone']),
        "is_primary" => (int) $r['is_primary'] === 1,
    ], db_all($conn, "SELECT id, name, phone, is_primary FROM emergency_contacts WHERE $scope ORDER BY is_primary DESC, id ASC", [$uid]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    json_out(["status" => "success", "contacts" => contact_rows($conn, $scope, $uid)]);
}

if ($method === 'POST') {
    $input = read_json();

    if (isset($input['contacts']) && is_array($input['contacts'])) {
        db_exec($conn, "DELETE FROM emergency_contacts WHERE $scope", [$uid]);
        $idx = 0;
        foreach ($input['contacts'] as $c) {
            $name = trim((string) ($c['name'] ?? '')) ?: 'Emergency Contact';
            $phone = normalize_phone($c['phone'] ?? '');
            if (strlen($phone) < 10) continue;
            db_exec($conn, "INSERT INTO emergency_contacts (user_id, name, phone, is_primary) VALUES (?,?,?,?)",
                [$uid, mb_substr($name, 0, 100), $phone, $idx === 0 ? 1 : 0]);
            $idx++;
        }
        json_out(["status" => "success", "message" => "Contacts synchronized", "contacts" => contact_rows($conn, $scope, $uid)]);
    }

    $name = trim((string) ($input['name'] ?? '')) ?: 'Emergency Contact';
    $phone = normalize_phone($input['phone'] ?? '');
    if (strlen($phone) < 10) fail("Valid phone number with at least 10 digits is required");
    db_exec($conn, "INSERT INTO emergency_contacts (user_id, name, phone, is_primary) VALUES (?,?,?,?)",
        [$uid, mb_substr($name, 0, 100), $phone, !empty($input['is_primary']) ? 1 : 0]);
    json_out(["status" => "success", "message" => "Contact added", "contact" => [
        "id" => $conn->insert_id, "name" => $name, "phone" => $phone, "is_primary" => !empty($input['is_primary']),
    ]]);
}

if ($method === 'DELETE') {
    $input = read_json();
    if (isset($input['id'])) {
        db_exec($conn, "DELETE FROM emergency_contacts WHERE id = ? AND $scope", [(int) $input['id'], $uid]);
    } elseif (isset($input['phone'])) {
        db_exec($conn, "DELETE FROM emergency_contacts WHERE phone = ? AND $scope", [normalize_phone($input['phone']), $uid]);
    }
    json_out(["status" => "success", "message" => "Contact deleted"]);
}

fail("Unsupported method", 405);
