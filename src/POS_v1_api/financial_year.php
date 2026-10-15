<?php
// v1_api/financial_year.php
require_once 'dbconnection.php';

if (isset($GLOBALS['_RAW_INPUT'])) {
    $postData = json_decode($GLOBALS['_RAW_INPUT'], true);
} else {
    $postData = json_decode(file_get_contents('php://input'), true);
}

logRequest('financial_year', $postData);

if (empty($postData)) {
    http_response_code(400);
    $response = ['status' => 'error', 'message' => 'No data received'];
    logResponse('financial_year', $response);
    echo json_encode($response);
    exit;
}

$type          = isset($postData['type']) ? intval($postData['type']) : 0;
$company_id    = isset($postData['company_id']) ? trim($postData['company_id']) : '';
$franchise_id  = isset($postData['franchise_id']) ? trim($postData['franchise_id']) : '';
$financial_year_id = isset($postData['financial_year_id']) ? intval($postData['financial_year_id']) : 0;
$title         = isset($postData['financial_year_title']) ? trim($postData['financial_year_title']) : '';
$is_current    = isset($postData['is_current']) ? intval($postData['is_current']) : 0;

/**
 * Helper: compute start_date and end_date from a title like "2026-27"
 */
function getDatesFromTitle($title) {
    // Expects format "YYYY-YY" e.g., "2026-27"
    if (preg_match('/^(\d{4})-(\d{2})$/', $title, $matches)) {
        $startYear = intval($matches[1]);
        $endYear   = intval('20' . $matches[2]); // if "27" → 2027
        // If end year is less than start year (e.g., "2026-27" – fine)
        // but if someone passes "2026-2027" we handle both
        if ($endYear < $startYear) {
            $endYear = $startYear + 1;
        }
        $start_date = date('Y-m-d', strtotime("$startYear-04-01"));
        $end_date   = date('Y-m-d', strtotime("$endYear-03-31"));
        return ['start_date' => $start_date, 'end_date' => $end_date, 'end_year' => $endYear];
    }
    // fallback: try to parse as "2026-2027"
    if (preg_match('/^(\d{4})-(\d{4})$/', $title, $matches)) {
        $startYear = intval($matches[1]);
        $endYear   = intval($matches[2]);
        $start_date = date('Y-m-d', strtotime("$startYear-04-01"));
        $end_date   = date('Y-m-d', strtotime("$endYear-03-31"));
        return ['start_date' => $start_date, 'end_date' => $end_date, 'end_year' => $endYear];
    }
    return false;
}

/**
 * Run a prepared statement (same as in category.php)
 */
function runPrepared($conn, $query, $types, $params, $apiName = 'financial_year') {
    $stmt = mysqli_prepare($conn, $query);
    if ($stmt === false) {
        logError($apiName, 'Prepare failed: ' . mysqli_error($conn));
        return false;
    }
    if ($types !== '' && !empty($params)) {
        mysqli_stmt_bind_param($stmt, $types, ...$params);
    }
    if (!mysqli_stmt_execute($stmt)) {
        logError($apiName, 'Execute failed: ' . mysqli_stmt_error($stmt));
        mysqli_stmt_close($stmt);
        return false;
    }
    $result = mysqli_stmt_get_result($stmt);
    if ($result === false) {
        // INSERT/UPDATE/DELETE
        $insertId = mysqli_stmt_insert_id($stmt);
        $affected = mysqli_stmt_affected_rows($stmt);
        mysqli_stmt_close($stmt);
        return ['insert_id' => $insertId, 'affected_rows' => $affected];
    }
    mysqli_stmt_close($stmt);
    return $result;
}

$response = ['status' => 'error', 'message' => 'Invalid request'];
http_response_code(400);

switch ($type) {

    // ---------- 1. Insert ----------
    case 1: {
        if (empty($company_id) || empty($franchise_id) || empty($title)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company, franchise and title are required'];
            break;
        }

        // Check duplicate (active only)
        $check = "SELECT financial_year_id FROM tbl_financial_year
                  WHERE company_id = ? AND franchise_id = ? AND financial_year_title = ? AND is_deleted = 1";
        $checkResult = runPrepared($sql, $check, 'sss', [$company_id, $franchise_id, $title]);
        if ($checkResult === false) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Duplicate check failed'];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Financial year already exists'];
            break;
        }

        $dates = getDatesFromTitle($title);
        if ($dates === false) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Invalid title format (use YYYY-YY or YYYY-YYYY)'];
            break;
        }

        // If is_current = 1, clear any existing current for this company/franchise
        if ($is_current == 1) {
            $clear = "UPDATE tbl_financial_year SET is_current = 0
                      WHERE company_id = ? AND franchise_id = ? AND is_deleted = 1";
            runPrepared($sql, $clear, 'ss', [$company_id, $franchise_id]);
        }

        $query = "INSERT INTO tbl_financial_year
                  (company_id, franchise_id, financial_year_title, start_date, end_date, is_current, is_deleted, c_date)
                  VALUES (?, ?, ?, ?, ?, ?, 1, NOW())";
        $result = runPrepared($sql, $query, 'sssssi',
            [$company_id, $franchise_id, $title, $dates['start_date'], $dates['end_date'], $is_current]);

        if ($result !== false) {
            logMessage('financial_year', "New year added: $title (ID: {$result['insert_id']})", 'INFO');
            http_response_code(201);
            $response = [
                'status' => 'success',
                'message' => 'Financial year added',
                'financial_year_id' => $result['insert_id']
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to add financial year'];
        }
        break;
    }

    // ---------- 2. List ----------
    case 2: {
        if (empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Company and franchise IDs required'];
            break;
        }

        $query = "SELECT financial_year_id, company_id, franchise_id, financial_year_title,
                         start_date, end_date, is_current, is_deleted, c_date, u_date
                  FROM tbl_financial_year
                  WHERE company_id = ? AND franchise_id = ? AND is_deleted = 1
                  ORDER BY start_date DESC";
        $result = runPrepared($sql, $query, 'ss', [$company_id, $franchise_id]);

        if ($result !== false) {
            $years = [];
            while ($row = mysqli_fetch_assoc($result)) {
                $years[] = $row;
            }
            http_response_code(200);
            $response = [
                'status' => 'success',
                'message' => 'Years fetched',
                'data' => $years,
                'total' => count($years)
            ];
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to fetch years'];
        }
        break;
    }

    // ---------- 3. Update ----------
    case 3: {
        if (empty($financial_year_id) || empty($company_id) || empty($franchise_id) || empty($title)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'All fields required'];
            break;
        }

        // Duplicate check (exclude current)
        $check = "SELECT financial_year_id FROM tbl_financial_year
                  WHERE company_id = ? AND franchise_id = ? AND financial_year_title = ?
                    AND is_deleted = 1 AND financial_year_id != ?";
        $checkResult = runPrepared($sql, $check, 'sssi', [$company_id, $franchise_id, $title, $financial_year_id]);
        if ($checkResult === false) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Duplicate check failed'];
            break;
        }
        if (mysqli_num_rows($checkResult) > 0) {
            http_response_code(409);
            $response = ['status' => 'error', 'message' => 'Financial year already exists'];
            break;
        }

        $dates = getDatesFromTitle($title);
        if ($dates === false) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Invalid title format'];
            break;
        }

        // If setting current, clear others
        if ($is_current == 1) {
            $clear = "UPDATE tbl_financial_year SET is_current = 0
                      WHERE company_id = ? AND franchise_id = ? AND is_deleted = 1
                      AND financial_year_id != ?";
            runPrepared($sql, $clear, 'ssi', [$company_id, $franchise_id, $financial_year_id]);
        }

        $query = "UPDATE tbl_financial_year
                  SET financial_year_title = ?, start_date = ?, end_date = ?, is_current = ?, u_date = NOW()
                  WHERE financial_year_id = ? AND company_id = ? AND franchise_id = ? AND is_deleted = 1";
        $result = runPrepared($sql, $query, 'sssiiis',
            [$title, $dates['start_date'], $dates['end_date'], $is_current,
             $financial_year_id, $company_id, $franchise_id]);

        if ($result !== false) {
            if ($result['affected_rows'] === 0) {
                // Check existence
                $exists = runPrepared($sql,
                    "SELECT financial_year_id FROM tbl_financial_year
                     WHERE financial_year_id = ? AND company_id = ? AND franchise_id = ? AND is_deleted = 1",
                    'iss', [$financial_year_id, $company_id, $franchise_id]);
                if ($exists !== false && mysqli_num_rows($exists) > 0) {
                    http_response_code(200);
                    $response = ['status' => 'success', 'message' => 'No changes to save'];
                } else {
                    http_response_code(404);
                    $response = ['status' => 'error', 'message' => 'Financial year not found'];
                }
            } else {
                logMessage('financial_year', "Year updated: $title (ID: $financial_year_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Financial year updated'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Failed to update'];
        }
        break;
    }

    // ---------- 4. Soft delete ----------
    case 4: {
        if (empty($financial_year_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'ID, company and franchise required'];
            break;
        }

        $query = "UPDATE tbl_financial_year SET is_deleted = 0
                  WHERE financial_year_id = ? AND company_id = ? AND franchise_id = ?";
        $result = runPrepared($sql, $query, 'iss', [$financial_year_id, $company_id, $franchise_id]);

        if ($result !== false) {
            if ($result['affected_rows'] === 0) {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Not found'];
            } else {
                logMessage('financial_year', "Year deleted (ID: $financial_year_id)", 'INFO');
                http_response_code(200);
                $response = ['status' => 'success', 'message' => 'Deleted'];
            }
        } else {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Delete failed'];
        }
        break;
    }

    // ---------- 5. Get single ----------
    case 5: {
        if (empty($financial_year_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }

        $query = "SELECT * FROM tbl_financial_year
                  WHERE financial_year_id = ? AND company_id = ? AND franchise_id = ? AND is_deleted = 1";
        $result = runPrepared($sql, $query, 'iss', [$financial_year_id, $company_id, $franchise_id]);

        if ($result !== false && mysqli_num_rows($result) > 0) {
            $row = mysqli_fetch_assoc($result);
            http_response_code(200);
            $response = ['status' => 'success', 'data' => $row];
        } elseif ($result === false) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Fetch failed'];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Not found'];
        }
        break;
    }

    // ---------- 6. Set current ----------
    case 6: {
        if (empty($financial_year_id) || empty($company_id) || empty($franchise_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Missing parameters'];
            break;
        }

        // Clear current for others
        $clear = "UPDATE tbl_financial_year SET is_current = 0
                  WHERE company_id = ? AND franchise_id = ? AND is_deleted = 1";
        runPrepared($sql, $clear, 'ss', [$company_id, $franchise_id]);

        $update = "UPDATE tbl_financial_year SET is_current = 1, u_date = NOW()
                   WHERE financial_year_id = ? AND company_id = ? AND franchise_id = ? AND is_deleted = 1";
        $result = runPrepared($sql, $update, 'iss', [$financial_year_id, $company_id, $franchise_id]);

        if ($result !== false && $result['affected_rows'] > 0) {
            http_response_code(200);
            $response = ['status' => 'success', 'message' => 'Current year updated'];
        } else {
            http_response_code(404);
            $response = ['status' => 'error', 'message' => 'Year not found or already current'];
        }
        break;
    }

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid type'];
        logError('financial_year', "Invalid type: $type");
}

logResponse('financial_year', $response);
echo json_encode($response);
mysqli_close($sql);