<?php
// Automated voice calls through Twilio, shared by the emergency call
// (trigger_voice_call.php) and the rider's "Test emergency call".
// Config lives only on the server in ../twilio_voice_config.php.

function voice_config() {
    $file = __DIR__ . '/../twilio_voice_config.php';
    if (!file_exists($file)) return null;
    include $file;
    if (empty($twilio_account_sid) || empty($twilio_auth_token) || empty($twilio_from_number) || strpos($twilio_account_sid, "ACxxx") === 0) {
        return null;
    }
    return [
        "sid" => $twilio_account_sid,
        "token" => $twilio_auth_token,
        "from" => $twilio_from_number,
        "voice" => $twilio_voice_actor ?? "Polly.Aditi",
        "lang" => $twilio_voice_language ?? "en-IN",
    ];
}

function voice_e164($phone) {
    $digits = preg_replace('/[^0-9]/', '', (string) $phone);
    if (strlen($digits) === 10) return "+91" . $digits;
    if (strlen($digits) === 11 && $digits[0] === "0") return "+91" . substr($digits, 1);
    return "+" . $digits;
}

// Builds the spoken message (said twice, so a sleepy or startled listener
// catches it). Served to Twilio by api/voice_twiml.php.
function voice_twiml($cfg, $sentences) {
    $say = function ($text) use ($cfg) {
        return '<Say voice="' . htmlspecialchars($cfg['voice'], ENT_QUOTES) . '" language="' . htmlspecialchars($cfg['lang'], ENT_QUOTES) . '">'
             . htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8') . '</Say>';
    };
    $text = implode(' ', $sentences);
    return '<Response><Pause length="1"/>' . $say($text) . '<Pause length="1"/>' . $say("I repeat. " . $text) . '</Response>';
}

// Twilio's most common failure codes, explained for a non-technical admin.
function voice_explain($code, $message) {
    $known = [
        20003 => "Twilio rejected the Account SID / Auth Token. Check twilio_voice_config.php.",
        21210 => "The 'From' number isn't a phone number on this Twilio account. Buy/choose a Twilio number and put it in twilio_voice_config.php.",
        21212 => "The 'From' number is invalid. Use your Twilio number in +1… or +91… format.",
        21606 => "The 'From' number can't make calls. Use a voice-capable Twilio number.",
        21219 => "Twilio trial accounts can only call verified numbers. Add this number in Twilio Console → Phone Numbers → Verified Caller IDs, or upgrade the account.",
        573002 => "Twilio trial accounts can only call verified numbers. Add this number in Twilio Console → Phone Numbers → Verified Caller IDs, or upgrade the account to call any number.",
        21215 => "Calls to this country are blocked. Enable India in Twilio Console → Voice → Settings → Geo Permissions.",
        13227 => "Calls to this country are blocked. Enable India in Twilio Console → Voice → Settings → Geo Permissions.",
        21211 => "This phone number isn't valid.",
        21217 => "This phone number isn't valid.",
    ];
    return $known[(int) $code] ?? ($message ?: "Twilio error $code");
}

// Signed message link for api/voice_twiml.php. Twilio trial accounts can't
// send the words inline with the call, so Twilio fetches them from our own
// server instead; the HMAC (keyed by the auth token) and 15-minute expiry
// stop anyone else from using that page.
function voice_b64($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function voice_unb64($s) { return base64_decode(strtr($s, '-_', '+/')); }

function voice_message_url($cfg, $lines) {
    require_once __DIR__ . '/mailer.php'; // app_base_url()
    $m = voice_b64(json_encode(["lines" => array_values($lines), "exp" => time() + 900], JSON_UNESCAPED_UNICODE));
    $s = hash_hmac('sha256', $m, $cfg['token']);
    return app_base_url() . "/api/voice_twiml.php?m=$m&s=$s";
}

function voice_verify_payload($cfg, $m, $s) {
    if (!preg_match('/^[A-Za-z0-9_-]{1,4000}$/', $m) || !hash_equals(hash_hmac('sha256', $m, $cfg['token']), $s)) return null;
    $p = json_decode(voice_unb64($m), true);
    if (!is_array($p) || empty($p['lines']) || !is_array($p['lines']) || ($p['exp'] ?? 0) < time()) return null;
    $p['lines'] = array_map(fn($l) => mb_substr((string) $l, 0, 300), array_slice($p['lines'], 0, 8));
    return $p;
}

// Places one call that speaks $lines (twice). Returns ["ok", "to", "sid"|"code"+"error"].
function voice_call($cfg, $toPhone, $lines) {
    $to = voice_e164($toPhone);
    $ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$cfg['sid']}/Calls.json");
    curl_setopt_array($ch, [
        CURLOPT_USERPWD => "{$cfg['sid']}:{$cfg['token']}",
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(["To" => $to, "From" => $cfg['from'], "Url" => voice_message_url($cfg, $lines)]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        error_log("[Accidiox voice] network error: $curlErr");
        return ["ok" => false, "to" => $to, "code" => 0, "error" => "Couldn't reach Twilio from the server."];
    }
    $d = json_decode($response, true) ?: [];
    if ($http >= 200 && $http < 300) return ["ok" => true, "to" => $to, "sid" => $d['sid'] ?? null];

    $code = (int) ($d['code'] ?? 0);
    error_log("[Accidiox voice] Twilio $http code=$code " . ($d['message'] ?? ''));
    return ["ok" => false, "to" => $to, "code" => $code, "error" => voice_explain($code, $d['message'] ?? "HTTP $http")];
}

// Masks a number for display: +91 •••••• 9545
function voice_mask($e164) {
    return preg_replace('/\d(?=\d{4})/', '•', $e164);
}
