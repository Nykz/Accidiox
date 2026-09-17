<?php
// Sends the SOS message to every emergency contact automatically via the
// Twilio WhatsApp API (no "tap Send" step on the receiving end) — unlike a
// wa.me link, which WhatsApp deliberately requires a human to confirm.
//
// If twilio_config.php is missing (not set up yet) or a specific contact
// hasn't joined the Twilio Sandbox, that contact is reported back as
// "failed" so the frontend can fall back to opening a wa.me link for them
// instead, rather than silently losing the alert.
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit();
}

if (!file_exists(__DIR__ . '/twilio_config.php')) {
    http_response_code(200);
    echo json_encode(["status" => "not_configured", "message" => "twilio_config.php not set up yet", "results" => []]);
    exit();
}
require_once 'twilio_config.php';

$input = json_decode(file_get_contents('php://input'), true);
$message  = isset($input['message']) ? $input['message'] : '';
$contacts = isset($input['contacts']) && is_array($input['contacts']) ? $input['contacts'] : [];

if ($message === '' || count($contacts) === 0) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "message and contacts are required"]);
    exit();
}

function send_one_whatsapp($sid, $token, $from, $toPhone, $body) {
    $url = "https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json";

    // Twilio wants an E.164-ish number; strip anything but digits, the
    // rest of this app already asks riders to enter contacts as
    // "919876543210" style (country code + number, no plus/spaces).
    $digits = preg_replace('/[^0-9]/', '', $toPhone);

    $postFields = http_build_query([
        'From' => $from,
        'To'   => 'whatsapp:+' . $digits,
        'Body' => $body
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_USERPWD, "$sid:$token");
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        return ["ok" => false, "error" => $curlErr];
    }

    $decoded = json_decode($response, true);
    if ($httpCode >= 200 && $httpCode < 300) {
        return ["ok" => true, "sid" => isset($decoded['sid']) ? $decoded['sid'] : null];
    }
    return ["ok" => false, "error" => isset($decoded['message']) ? $decoded['message'] : "HTTP $httpCode"];
}

$results = [];
foreach ($contacts as $contact) {
    $phone = isset($contact['phone']) ? $contact['phone'] : '';
    $name  = isset($contact['name']) ? $contact['name'] : $phone;
    if ($phone === '') continue;

    $outcome = send_one_whatsapp($twilio_account_sid, $twilio_auth_token, $twilio_whatsapp_from, $phone, $message);
    $results[] = [
        "name" => $name,
        "phone" => $phone,
        "sent" => $outcome["ok"],
        "detail" => $outcome["ok"] ? $outcome["sid"] : $outcome["error"]
    ];
}

echo json_encode(["status" => "done", "results" => $results]);
?>
