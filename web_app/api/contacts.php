<?php
// API endpoint for syncing and managing Emergency Contacts in the MySQL database.
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit();
}

require_once 'db_config.php';

// Ensure table exists
$createTableSql = "CREATE TABLE IF NOT EXISTS `emergency_contacts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `is_primary` TINYINT(1) DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

$conn->query($createTableSql);

function normalizePhone($phone) {
    $digits = preg_replace('/[^0-9]/', '', (string)$phone);
    if (strlen($digits) === 10) {
        $digits = "91" . $digits;
    } elseif (strlen($digits) === 11 && substr($digits, 0, 1) === "0") {
        $digits = "91" . substr($digits, 1);
    }
    return $digits;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $sql = "SELECT id, name, phone, is_primary FROM `emergency_contacts` ORDER BY is_primary DESC, id ASC";
    $result = $conn->query($sql);
    $contacts = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $contacts[] = [
                "id" => intval($row['id']),
                "name" => $row['name'],
                "phone" => normalizePhone($row['phone']),
                "is_primary" => intval($row['is_primary']) === 1
            ];
        }
    }

    echo json_encode([
        "status" => "success",
        "contacts" => $contacts
    ]);
    $conn->close();
    exit();
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    // Bulk replace / full contacts list sync
    if (isset($input['contacts']) && is_array($input['contacts'])) {
        $incomingContacts = $input['contacts'];

        $conn->query("TRUNCATE TABLE `emergency_contacts`");

        $stmt = $conn->prepare("INSERT INTO `emergency_contacts` (name, phone, is_primary) VALUES (?, ?, ?)");
        $savedContacts = [];

        foreach ($incomingContacts as $idx => $c) {
            $name = isset($c['name']) && trim($c['name']) !== '' ? trim($c['name']) : 'Emergency Contact';
            $rawPhone = isset($c['phone']) ? $c['phone'] : '';
            $phone = normalizePhone($rawPhone);
            if (strlen($phone) < 10) continue;

            $isPrimary = ($idx === 0) ? 1 : 0;
            $stmt->bind_param("ssi", $name, $phone, $isPrimary);
            $stmt->execute();

            $savedContacts[] = [
                "id" => $conn->insert_id,
                "name" => $name,
                "phone" => $phone,
                "is_primary" => (bool)$isPrimary
            ];
        }
        $stmt->close();

        echo json_encode([
            "status" => "success",
            "message" => "Contacts synchronized to database successfully",
            "contacts" => $savedContacts
        ]);
        $conn->close();
        exit();
    }

    // Add single contact
    $name = isset($input['name']) && trim($input['name']) !== '' ? trim($input['name']) : 'Emergency Contact';
    $rawPhone = isset($input['phone']) ? $input['phone'] : '';
    $phone = normalizePhone($rawPhone);

    if (strlen($phone) < 10) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Valid phone number with at least 10 digits is required"]);
        $conn->close();
        exit();
    }

    $isPrimary = isset($input['is_primary']) && $input['is_primary'] ? 1 : 0;
    $stmt = $conn->prepare("INSERT INTO `emergency_contacts` (name, phone, is_primary) VALUES (?, ?, ?)");
    $stmt->bind_param("ssi", $name, $phone, $isPrimary);
    
    if ($stmt->execute()) {
        echo json_encode([
            "status" => "success",
            "message" => "Contact added successfully",
            "contact" => [
                "id" => $conn->insert_id,
                "name" => $name,
                "phone" => $phone,
                "is_primary" => (bool)$isPrimary
            ]
        ]);
    } else {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to save contact: " . $conn->error]);
    }
    $stmt->close();
    $conn->close();
    exit();
}

if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (isset($input['id'])) {
        $id = intval($input['id']);
        $conn->query("DELETE FROM `emergency_contacts` WHERE id = $id");
    } elseif (isset($input['phone'])) {
        $phone = normalizePhone($input['phone']);
        $conn->query("DELETE FROM `emergency_contacts` WHERE phone = '{$phone}'");
    }

    echo json_encode(["status" => "success", "message" => "Contact deleted"]);
    $conn->close();
    exit();
}

$conn->close();
?>