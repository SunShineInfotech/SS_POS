<?php
// v1_api/dbconnection.php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

date_default_timezone_set('Asia/Kolkata');
$c_date = date('Y-m-d H:i:s');
$date   = date('Y-m-d');
$time   = date('H:i:s');

/* ============================================
   DATABASE CONNECTION (POS)
   ============================================ */
$db_host = 'localhost';
$db_user = 'u362442499_pos';
$db_password = '6:v*2*x;8V';   // use single quotes
$db_name = 'u362442499_pos';

// PHP 8.1+ makes mysqli throw exceptions by default (MYSQLI_REPORT_ERROR |
// MYSQLI_REPORT_STRICT). That's fine for query errors we handle ourselves,
// but an uncaught exception from mysqli_connect() itself crashes the whole
// script with a raw PHP fatal error instead of JSON — which is what broke
// the frontend (axios gets HTML/plaintext, not the {status, message} shape
// every page expects, so error handling misfires unpredictably).
// We turn exception mode off and check connection errors manually instead.
mysqli_report(MYSQLI_REPORT_OFF);

$sql = @mysqli_connect($db_host, $db_user, $db_password, $db_name);

if (!$sql || mysqli_connect_errno()) {
    $connectError = mysqli_connect_error() ?: 'Unknown database connection error';
    // Log the real reason server-side only — never expose raw DB errors to the client.
    error_log('[DB CONNECT FAIL] ' . $connectError);
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Could not connect to the database. Please try again in a moment.'
    ]);
    exit();
}
mysqli_set_charset($sql, "utf8mb4");

/* ============================================
   SECURITY & SANITIZATION
   ============================================ */

function sanitizeInput($data) {
    if (is_array($data)) {
        return array_map('sanitizeInput', $data);
    }
    return htmlspecialchars(strip_tags(trim($data)), ENT_QUOTES, 'UTF-8');
}

/**
 * Check for malicious patterns (SQL injection, XSS, etc.)
 */
function isMalicious($data) {
    $patterns = [
        '/\b(union|select|insert|update|delete|drop|alter|create|truncate)\b/i',
        '/\b(script|onerror|onload|onclick|alert|console\.log|document\.cookie)\b/i',
        '/[;\-\-]+\s*(select|union|insert)/i',
        '/\/\*.*\*\//', // SQL comments
        '/\b(exec|xp_cmdshell|sp_executesql)\b/i'
    ];

    if (is_array($data)) {
        foreach ($data as $value) {
            if (isMalicious($value)) return true;
        }
        return false;
    }

    $decoded = urldecode($data);
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $decoded)) {
            return true;
        }
    }
    return false;
}

// Scan all incoming request data (GET, POST, PUT, DELETE, etc.)
$inputData = $_REQUEST;
if (!empty($inputData) && isMalicious($inputData)) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Malicious input detected']);
    exit();
}

// Sanitize all input for safe usage later
$_GET    = sanitizeInput($_GET);
$_POST   = sanitizeInput($_POST);
$_REQUEST = sanitizeInput($_REQUEST);

// Also sanitize raw JSON input
$rawInput = file_get_contents('php://input');
if ($rawInput) {
    $decoded = json_decode($rawInput, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        $decoded = sanitizeInput($decoded);

        // Don't scan the password field for SQL-keyword false positives —
        // every DB query now uses prepared statements, so a password
        // containing a word like "Delete" or "Update" is not a threat.
        $scanTarget = $decoded;
        if (is_array($scanTarget) && isset($scanTarget['password'])) {
            unset($scanTarget['password']);
        }

        if (isMalicious($scanTarget)) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Malicious input detected']);
            exit();
        }
        $GLOBALS['_RAW_INPUT'] = json_encode($decoded); // store sanitised JSON
    }
}

/* ============================================
   LOGGING CONFIGURATION (FILE-BASED)
   ============================================ */
$LOG_ENABLED = true;

$LOG_BASE_PATH = '../log/';
$LOG_MONTH_FOLDER = date('m-Y');
$LOG_DAY_FOLDER = date('d-m-Y');
$LOG_FULL_PATH = $LOG_BASE_PATH . $LOG_MONTH_FOLDER . '/' . $LOG_DAY_FOLDER . '/';

$USAGE_LOG_FILE = $LOG_BASE_PATH . 'api_usage.log';

/* ============================================
   LOGGING FUNCTIONS
   ============================================ */

function createLogDirectory($path) {
    if (!file_exists($path)) {
        return mkdir($path, 0777, true);
    }
    return true;
}

function logMessage($apiName, $message, $type = 'INFO') {
    global $LOG_ENABLED, $LOG_FULL_PATH, $USAGE_LOG_FILE;

    if (!$LOG_ENABLED) {
        return false;
    }

    createLogDirectory($LOG_FULL_PATH);

    $logFile = $LOG_FULL_PATH . $apiName . '.log';

    $timestamp = date('Y-m-d H:i:s');
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';
    $uri = $_SERVER['REQUEST_URI'] ?? 'UNKNOWN';
    $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? 'UNKNOWN';

    $logEntry = "========================================\n";
    $logEntry .= "TIMESTAMP: $timestamp\n";
    $logEntry .= "TYPE: $type\n";
    $logEntry .= "IP: $ip\n";
    $logEntry .= "METHOD: $method\n";
    $logEntry .= "URI: $uri\n";
    $logEntry .= "USER_AGENT: $user_agent\n";
    $logEntry .= "MESSAGE: $message\n";
    $logEntry .= "========================================\n\n";

    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);

    updateUsageLog($apiName);

    return true;
}

function updateUsageLog($apiName) {
    global $LOG_ENABLED, $USAGE_LOG_FILE;

    if (!$LOG_ENABLED) {
        return false;
    }

    $date = date('Y-m-d');
    $month = date('Y-m');
    $hour = date('H:00');

    $usageData = [];
    if (file_exists($USAGE_LOG_FILE)) {
        $content = file_get_contents($USAGE_LOG_FILE);
        if ($content) {
            $usageData = json_decode($content, true) ?? [];
        }
    }

    if (!isset($usageData[$date])) {
        $usageData[$date] = [];
    }
    if (!isset($usageData[$date][$apiName])) {
        $usageData[$date][$apiName] = 0;
    }
    if (!isset($usageData['monthly'][$month])) {
        $usageData['monthly'][$month] = [];
    }
    if (!isset($usageData['monthly'][$month][$apiName])) {
        $usageData['monthly'][$month][$apiName] = 0;
    }
    if (!isset($usageData['hourly'][$date][$hour])) {
        $usageData['hourly'][$date][$hour] = [];
    }
    if (!isset($usageData['hourly'][$date][$hour][$apiName])) {
        $usageData['hourly'][$date][$hour][$apiName] = 0;
    }

    $usageData[$date][$apiName]++;
    $usageData['monthly'][$month][$apiName]++;
    $usageData['hourly'][$date][$hour][$apiName]++;
    $usageData['last_updated'] = date('Y-m-d H:i:s');

    file_put_contents($USAGE_LOG_FILE, json_encode($usageData, JSON_PRETTY_PRINT), LOCK_EX);

    return true;
}

function logRequest($apiName, $requestData) {
    $message = "REQUEST DATA:\n" . print_r($requestData, true);
    return logMessage($apiName, $message, 'REQUEST');
}

function logResponse($apiName, $responseData) {
    $message = "RESPONSE DATA:\n" . print_r($responseData, true);
    return logMessage($apiName, $message, 'RESPONSE');
}

function logError($apiName, $error, $errorCode = null) {
    $message = "ERROR CODE: $errorCode\nERROR: " . print_r($error, true);
    return logMessage($apiName, $message, 'ERROR');
}

function logQuery($apiName, $query, $params = null) {
    $message = "QUERY: $query\n";
    if ($params) {
        $message .= "PARAMS: " . print_r($params, true);
    }
    return logMessage($apiName, $message, 'QUERY');
}

function getUsageStats($days = 7) {
    global $USAGE_LOG_FILE;

    if (!file_exists($USAGE_LOG_FILE)) {
        return ['error' => 'No usage data available'];
    }

    $content = file_get_contents($USAGE_LOG_FILE);
    $usageData = json_decode($content, true);

    if (!$usageData) {
        return ['error' => 'Invalid usage data'];
    }

    $stats = [
        'today' => [],
        'last_7_days' => [],
        'monthly' => [],
        'hourly' => [],
        'top_apis' => []
    ];

    $today = date('Y-m-d');
    if (isset($usageData[$today])) {
        $stats['today'] = $usageData[$today];
    }

    for ($i = 0; $i < $days; $i++) {
        $d = date('Y-m-d', strtotime("-$i days"));
        if (isset($usageData[$d])) {
            $stats['last_7_days'][$d] = $usageData[$d];
        }
    }

    if (isset($usageData['monthly'])) {
        $stats['monthly'] = $usageData['monthly'];
    }
    if (isset($usageData['hourly'])) {
        $stats['hourly'] = $usageData['hourly'];
    }

    $allApis = [];
    foreach ($usageData as $key => $value) {
        if (is_array($value) && $key !== 'monthly' && $key !== 'hourly' && $key !== 'last_updated') {
            foreach ($value as $api => $count) {
                if (!isset($allApis[$api])) {
                    $allApis[$api] = 0;
                }
                $allApis[$api] += $count;
            }
        }
    }
    arsort($allApis);
    $stats['top_apis'] = array_slice($allApis, 0, 10);

    return $stats;
}

/* ============================================
   AUTO CLEANUP (logs older than 30 days)
   ============================================ */
function deleteDirectory($dir) {
    if (!file_exists($dir)) return true;
    if (!is_dir($dir)) return unlink($dir);

    foreach (scandir($dir) as $item) {
        if ($item == '.' || $item == '..') continue;
        if (!deleteDirectory($dir . DIRECTORY_SEPARATOR . $item)) return false;
    }
    return rmdir($dir);
}

function is_dir_empty($dir) {
    if (!is_readable($dir)) return true;
    $files = scandir($dir);
    return count($files) <= 2;
}

function cleanupOldLogs($days = 30) {
    global $LOG_BASE_PATH;

    if (!file_exists($LOG_BASE_PATH)) {
        return false;
    }

    $files = scandir($LOG_BASE_PATH);
    $cutoff = strtotime("-$days days");

    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;

        $filePath = $LOG_BASE_PATH . $file;
        if (is_dir($filePath) && preg_match('/^(\d{2})-(\d{4})$/', $file, $matches)) {
            $monthDate = strtotime($matches[2] . '-' . $matches[1] . '-01');
            if ($monthDate < $cutoff) {
                deleteDirectory($filePath);
            } else {
                $dayFiles = scandir($filePath);
                foreach ($dayFiles as $dayFile) {
                    if ($dayFile === '.' || $dayFile === '..') continue;
                    $dayPath = $filePath . '/' . $dayFile;
                    if (is_dir($dayPath) && preg_match('/^\d{2}-\d{2}-\d{4}$/', $dayFile)) {
                        $dayDate = strtotime(str_replace('-', '/', $dayFile));
                        if ($dayDate < $cutoff) {
                            deleteDirectory($dayPath);
                        }
                    }
                }
                if (is_dir_empty($filePath)) {
                    rmdir($filePath);
                }
            }
        }
    }
}

// Run cleanup randomly on 1% of requests
if ($LOG_ENABLED && rand(1, 100) === 1) {
    cleanupOldLogs(30);
}

/* ============================================
   URL & PATH CONSTANTS (POS)
   ============================================ */
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https://" : "http://";
$server_url = $protocol . $_SERVER['HTTP_HOST'] . '/POS/';
$folder = "uploadfiles";
$upload_url = $server_url . $folder . '/';

$logo_url          = $upload_url . 'logo/';
$employee_url      = $upload_url . 'employee/';
$product_url       = $upload_url . 'product/';
$product_category_url = $upload_url . 'product_category/';
$other_url         = $upload_url . 'other/';

$upload_logo_url          = '../' . $folder . '/logo/';
$upload_employee_url      = '../' . $folder . '/employee/';
$upload_product_url       = '../' . $folder . '/product/';
$upload_product_category_url = '../' . $folder . '/product_category/';
$upload_other_url         = '../' . $folder . '/other/';

$no_data_found = $other_url . 'no_data_found.png';

$android_store_link = "https://play.google.com/store/apps/details?id=com.sunshineinfotech.trackdeskpro";
$ios_store_link = "https://apps.apple.com/us/app/track-desk-sunshine-infotech/id6747991822";

if ($LOG_ENABLED) {
    logMessage('SYSTEM', 'Database connected successfully', 'INFO');
}