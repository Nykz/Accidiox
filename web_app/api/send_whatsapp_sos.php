<?php
// Sends the SOS message to every emergency contact automatically via Meta's
// WhatsApp Cloud API (no "tap Send" step on the receiving end) — unlike a
// wa.me link, which WhatsApp deliberately requires a human to confirm.
//
// This is a business-initiated message (the contact hasn't messaged us
// first), so WhatsApp requires a pre-approved message template rather than
// free-form text — see the "crash_alert" template in WhatsApp Manager.
//
// If meta_whatsapp_config.php is missing (not set up yet), the template
// isn't approved yet, or a specific contact hasn't been added as a test
// recipient, that contact is reported back as "failed" so the frontend can
// fall back to opening a wa.me link for them instead, rather than silently
// losing the alert.
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit();
}

if (!file_exists(__DIR__ . '/meta_whatsapp_config.php')) {
    http_response_code(200);
    echo json_encode(["status" => "not_configured", "message" => "meta_whatsapp_config.php not set up yet", "results" => []]);
    exit();
}
require_once 'meta_whatsapp_config.php';

$input = json_decode(file_get_contents('php://input'), true);
$contacts       = isset($input['contacts']) && is_array($input['contacts']) ? $input['contacts'] : [];
$templateParams = isset($input['templateParams']) && is_array($input['templateParams']) ? $input['templateParams'] : [];

if (count($contacts) === 0 || count($templateParams) === 0) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "contacts and templateParams are required"]);
    exit();
}

function send_one_whatsapp($phoneNumberId, $accessToken, $templateName, $templateLang, $toPhone, $params) {
    $url = "https://graph.facebook.com/v20.0/{$phoneNumberId}/messages";

    // Meta wants digits-only with country code and no "+".
    // If a 10-digit mobile number is entered, automatically prepend "91" (India country code).
    $digits = preg_replace('/[^0-9]/', '', $toPhone);
    if (strlen($digits) === 10) {
        $digits = "91" . $digits;
    } elseif (strlen($digits) === 11 && substr($digits, 0, 1) === "0") {
        $digits = "91" . substr($digits, 1);
    }

    $parameters = array_map(function ($text) {
        return ["type" => "text", "text" => (string) $text];
    }, $params);

    $payload = [
        "messaging_product" => "whatsapp",
        "to" => $digits,
        "type" => "template",
        "template" => [
            "name" => $templateName,
            "language" => ["code" => $templateLang],
            "components" => [
                ["type" => "body", "parameters" => $parameters]
            ]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $accessToken",
        "Content-Type: application/json"
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
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
        $msgId = isset($decoded['messages'][0]['id']) ? $decoded['messages'][0]['id'] : null;
        return ["ok" => true, "id" => $msgId];
    }
    // Surface the full Meta error object (code/subcode/type), not just the
    // message, so failures can actually be diagnosed instead of guessed at.
    $err = isset($decoded['error']) ? $decoded['error'] : ["message" => "HTTP $httpCode"];
    $errMsg = (isset($err['message']) ? $err['message'] : "HTTP $httpCode")
        . (isset($err['error_subcode']) ? " (subcode {$err['error_subcode']})" : "")
        . (isset($err['code']) ? " [code {$err['code']}]" : "")
        . (isset($err['error_data']['details']) ? " - " . $err['error_data']['details'] : "");
    return ["ok" => false, "error" => $errMsg];
}

$results = [];
foreach ($contacts as $contact) {
    $phone = isset($contact['phone']) ? $contact['phone'] : '';
    $name  = isset($contact['name']) ? $contact['name'] : $phone;
    if ($phone === '') continue;

    $outcome = send_one_whatsapp($meta_phone_number_id, $meta_access_token, $meta_template_name, $meta_template_lang, $phone, $templateParams);
    $results[] = [
        "name" => $name,
        "phone" => $phone,
        "sent" => $outcome["ok"],
        "detail" => $outcome["ok"] ? $outcome["id"] : $outcome["error"]
    ];
}

echo json_encode(["status" => "done", "results" => $results]);
?>
