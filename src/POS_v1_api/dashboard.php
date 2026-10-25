<?php
/**
 * ============================================================
 *  SunShine POS — Dashboard API  (u362442499_pos schema)
 *  File: v1_api/dashboard.php
 * ============================================================
 *
 *  1) Summary
 *     GET dashboard.php?action=summary&company_id=1&franchise_id=1
 *         &from_date=2026-10-25&from_time=00:00
 *         &to_date=2026-10-25&to_time=23:59
 *
 *  2) Trend charts
 *     GET dashboard.php?action=trend&company_id=1&franchise_id=1
 *         &metric=sales_purchase|income_expense
 *         &granularity=daily&month=2026-10   |  monthly&year=2026  |  yearly&year=2022
 *
 *  Response: { "success": true, "data": {...} }  |  { "success": false, "message": "..." }
 *
 *  NOTE (aapke DB ke hisaab se):
 *   - is_deleted = 1 → ACTIVE record,  0 → deleted   (data mein yahi pattern hai)
 *   - sell_date / purchess_date / expense_date / transaction_date sirf DATE hain,
 *     isliye TIME record ke c_date se liya jaata hai.
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/config.php'; // must create $conn = new mysqli(...)

/* ============================================================
 * CONFIG
 * ============================================================ */
const DASH_DEBUG      = true;      // production mein false kar dena
const ACTIVE          = 1;         // is_deleted value for ACTIVE rows
const LOW_STOCK_LIMIT = 5;         // product_stock <= ye value → Low Stock
const DB_TZ           = '+00:00';  // c_date kis timezone mein save hota hai (Hostinger MySQL = UTC)
const APP_TZ          = '+05:30';  // dashboard ka time (IST)

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
if (!isset($conn) || !($conn instanceof mysqli)) fail('Database connection ($conn) not found in config.php', 500);
$conn->set_charset('utf8mb4');

/* ============================================================
 * HELPERS
 * ============================================================ */
function respond(array $payload, int $code = 200): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}
function fail(string $msg, int $code = 400): void { respond(['success' => false, 'message' => $msg], $code); }

/** Prepared query — types auto-detect. */
function run(mysqli $c, string $sql, array $params = []): array {
    $stmt = $c->prepare($sql);
    if ($params) {
        $types = '';
        foreach ($params as $p) $types .= is_int($p) ? 'i' : (is_float($p) ? 'd' : 's');
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $res  = $stmt->get_result();
    $rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
    $stmt->close();
    return $rows;
}
function scalar(mysqli $c, string $sql, array $params = []): float {
    $r = run($c, $sql, $params);
    return $r ? (float)array_values($r[0])[0] : 0.0;
}
function validDate(string $d): bool {
    $x = DateTime::createFromFormat('Y-m-d', $d);
    return $x && $x->format('Y-m-d') === $d;
}
function validTime(string $t): bool { return (bool)preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t); }

/** company_id (required) + franchise_id (optional, 0 = all outlets). */
function context(): array {
    // TODO: yahan apna existing token / session validation lagao (login.php jaisa)
    $cid = $_GET['company_id'] ?? '';
    $fid = $_GET['franchise_id'] ?? '0';
    if ($cid === '' || !ctype_digit((string)$cid)) fail('company_id is required', 401);
    if ($fid === '' || !ctype_digit((string)$fid)) $fid = '0';
    return ['cid' => (int)$cid, 'fid' => (int)$fid];
}

/**
 * Common WHERE: company + active + franchise.
 * $a = table alias ('' for single-table queries).
 */
function scope(array $ctx, string $a = '', bool $hasFranchise = true): array {
    $p   = $a === '' ? '' : "$a.";
    $sql = "{$p}company_id = ? AND {$p}is_deleted = " . ACTIVE;
    $par = [$ctx['cid']];
    if ($hasFranchise && $ctx['fid'] > 0) { $sql .= " AND {$p}franchise_id = ?"; $par[] = $ctx['fid']; }
    return [$sql, $par];
}

/** Business date + c_date ka time = actual bill datetime (IST). */
function dtExpr(string $dateCol, string $cdateCol): string {
    $t = DB_TZ === APP_TZ ? "TIME($cdateCol)" : "TIME(CONVERT_TZ($cdateCol, '" . DB_TZ . "', '" . APP_TZ . "'))";
    return "TIMESTAMP($dateCol, $t)";
}

/** Start datetime → End datetime filter (date index pehle, phir exact time). */
function rangeSql(string $dateCol, string $cdateCol, array $r): array {
    return [
        "$dateCol BETWEEN ? AND ? AND " . dtExpr($dateCol, $cdateCol) . " BETWEEN ? AND ?",
        [$r['from_date'], $r['to_date'], $r['from_date'] . ' ' . $r['from_time'], $r['to_date'] . ' ' . $r['to_time']],
    ];
}

/** Request se Start/End date-time padho + validate. */
function readRange(): array {
    $today = date('Y-m-d');
    $fd = $_GET['from_date'] ?? $today;
    $td = $_GET['to_date']   ?? $today;
    $ft = substr($_GET['from_time'] ?? '00:00', 0, 5);
    $tt = substr($_GET['to_time']   ?? '23:59', 0, 5);
    if (!validDate($fd) || !validDate($td)) fail('Invalid date. Use YYYY-MM-DD');
    if (!validTime($ft) || !validTime($tt)) fail('Invalid time. Use HH:MM');
    if ("$fd $ft" > "$td $tt") fail('Start date-time must be before End date-time');
    return ['from_date' => $fd, 'to_date' => $td, 'from_time' => "$ft:00", 'to_time' => "$tt:59"];
}

/** Same length ka previous period (change % ke liye). */
function prevRange(array $r): array {
    $from = strtotime($r['from_date'] . ' ' . $r['from_time']);
    $to   = strtotime($r['to_date'] . ' ' . $r['to_time']);
    $pt   = $from - 1;
    $pf   = $pt - ($to - $from);
    return [
        'from_date' => date('Y-m-d', $pf), 'from_time' => date('H:i:s', $pf),
        'to_date'   => date('Y-m-d', $pt), 'to_time'   => date('H:i:s', $pt),
    ];
}

/* ---------- reusable WHERE fragments for tbl_transaction ---------- */
// Customer se aaya paisa (sale ke baad ka receipt)
const RECEIPT_COND = "transaction_type = 1 AND transaction_customer_id IS NOT NULL AND transaction_account_id IS NOT NULL";
// Other income = manual credit entry jo kisi bill / party / expense se linked nahi
const OTHER_INCOME_COND = "transaction_type = 1
    AND transaction_sell_id IS NULL AND transaction_purches_id IS NULL
    AND transaction_customer_id IS NULL AND transaction_vendor_id IS NULL
    AND transaction_expense_category_id IS NULL
    AND COALESCE(transaction_sales_return_id, 0) = 0 AND COALESCE(transaction_purches_return_id, 0) = 0";

/** Ek range ke saare main numbers. */
function metrics(mysqli $c, array $ctx, array $r): array {
    [$s, $sp] = scope($ctx);

    [$w, $p] = rangeSql('sell_date', 'c_date', $r);
    $sell = run($c,
        "SELECT COALESCE(SUM(sell_total_amount),0) sales, COUNT(*) orders,
                COUNT(DISTINCT sell_customer_id) customers, COALESCE(SUM(sales_total_paid_amount),0) paid
           FROM tbl_sell WHERE $s AND $w", array_merge($sp, $p))[0];

    [$w, $p] = rangeSql('purchess_date', 'c_date', $r);
    $purchases = scalar($c, "SELECT COALESCE(SUM(purches_total_with_gst_amount),0) FROM tbl_purchess WHERE $s AND $w", array_merge($sp, $p));

    [$w, $p] = rangeSql('expense_date', 'c_date', $r);
    $expense = scalar($c, "SELECT COALESCE(SUM(expense_amount),0) FROM tbl_expenses WHERE $s AND $w", array_merge($sp, $p));

    [$w, $p] = rangeSql('transaction_date', 'c_date', $r);
    $tx = run($c,
        "SELECT COALESCE(SUM(CASE WHEN " . OTHER_INCOME_COND . " THEN transaction_amount END),0) inc,
                COALESCE(SUM(CASE WHEN " . RECEIPT_COND . " THEN transaction_amount END),0) rec
           FROM tbl_transaction WHERE $s AND $w", array_merge($sp, $p))[0];

    return [
        'sales'         => (float)$sell['sales'],
        'orders'        => (int)$sell['orders'],
        'customers'     => (int)$sell['customers'],
        'purchases'     => $purchases,
        'other_income'  => (float)$tx['inc'],
        'other_expense' => $expense,
        'collection'    => (float)$sell['paid'] + (float)$tx['rec'],
    ];
}

/** Date-level collection (Today / Month / FY cards). */
function collectionBetween(mysqli $c, array $ctx, string $from, string $to): float {
    [$s, $sp] = scope($ctx);
    $paid = scalar($c, "SELECT COALESCE(SUM(sales_total_paid_amount),0) FROM tbl_sell WHERE $s AND sell_date BETWEEN ? AND ?",
        array_merge($sp, [$from, $to]));
    $rec  = scalar($c, "SELECT COALESCE(SUM(transaction_amount),0) FROM tbl_transaction WHERE $s AND " . RECEIPT_COND . " AND transaction_date BETWEEN ? AND ?",
        array_merge($sp, [$from, $to]));
    return $paid + $rec;
}

/* ============================================================
 * ACTION: SUMMARY
 * ============================================================ */
function actionSummary(mysqli $conn): void {
    $ctx  = context();
    $r    = readRange();
    $prev = prevRange($r);
    [$s, $sp] = scope($ctx);

    $cur = metrics($conn, $ctx, $r);
    $old = metrics($conn, $ctx, $prev);
    $kpis = [];
    foreach ($cur as $k => $v) $kpis[$k] = ['value' => $v, 'prev' => $old[$k]];

    // ---- Collections ----
    $today = date('Y-m-d');
    $fy = run($conn, "SELECT start_date FROM tbl_financial_year WHERE company_id = ? AND is_current = 1 AND is_deleted = " . ACTIVE . " LIMIT 1", [$ctx['cid']]);
    $fyStart = ($fy && $fy[0]['start_date']) ? $fy[0]['start_date']
        : (((int)date('n') >= 4 ? date('Y') : ((int)date('Y') - 1)) . '-04-01');

    // payment mode breakdown (selected range)
    $modes = [];
    [$w, $p] = rangeSql('sell_date', 'c_date', $r);
    foreach (run($conn,
        "SELECT COALESCE(NULLIF(sell_payment_mode,''),'Other') mode, SUM(sales_total_paid_amount) amount
           FROM tbl_sell WHERE $s AND $w GROUP BY COALESCE(NULLIF(sell_payment_mode,''),'Other')",
        array_merge($sp, $p)) as $m) {
        $modes[$m['mode']] = ($modes[$m['mode']] ?? 0) + (float)$m['amount'];
    }
    [$w, $p] = rangeSql('transaction_date', 'c_date', $r);
    foreach (run($conn,
        "SELECT CASE transaction_transfer_type WHEN 1 THEN 'Bank' WHEN 2 THEN 'Cash' WHEN 3 THEN 'UPI' ELSE 'Other' END mode,
                SUM(transaction_amount) amount
           FROM tbl_transaction WHERE $s AND " . RECEIPT_COND . " AND $w
          GROUP BY CASE transaction_transfer_type WHEN 1 THEN 'Bank' WHEN 2 THEN 'Cash' WHEN 3 THEN 'UPI' ELSE 'Other' END",
        array_merge($sp, $p)) as $m) {
        $modes[$m['mode']] = ($modes[$m['mode']] ?? 0) + (float)$m['amount'];
    }
    arsort($modes);
    $byMode = [];
    foreach ($modes as $mode => $amt) if ($amt > 0) $byMode[] = ['mode' => $mode, 'amount' => round($amt, 2)];

    $collections = [
        'today'   => collectionBetween($conn, $ctx, $today, $today),
        'month'   => collectionBetween($conn, $ctx, date('Y-m-01'), $today),
        'fy'      => collectionBetween($conn, $ctx, $fyStart, $today),
        'by_mode' => $byMode,
    ];

    // ---- Outstanding (customer_wallet / vendor_wallet) ----
    $custRows = run($conn,
        "SELECT c.customer_id id, c.customer_name name, COALESCE(c.customer_mobile,'') mobile, c.customer_wallet amount,
                (SELECT MAX(s.sell_date) FROM tbl_sell s WHERE s.sell_customer_id = c.customer_id AND s.is_deleted = " . ACTIVE . ") last
           FROM tbl_customer c
          WHERE c.company_id = ? AND c.is_deleted = " . ACTIVE . " AND c.customer_wallet > 0
          ORDER BY c.customer_wallet DESC LIMIT 5", [$ctx['cid']]);
    $custTotal = scalar($conn,
        "SELECT COALESCE(SUM(customer_wallet),0) FROM tbl_customer WHERE company_id = ? AND is_deleted = " . ACTIVE . " AND customer_wallet > 0",
        [$ctx['cid']]);

    [$vs, $vp] = scope($ctx, 'v');
    $vendRows = run($conn,
        "SELECT v.vendor_id id, v.vendor_name name, COALESCE(v.vendor_mobile_no,'') mobile, v.vendor_wallet amount,
                (SELECT MAX(p.purchess_date) FROM tbl_purchess p WHERE p.purchess_vendor_id = v.vendor_id AND p.is_deleted = " . ACTIVE . ") last
           FROM tbl_vendor v
          WHERE $vs AND v.vendor_wallet > 0
          ORDER BY v.vendor_wallet DESC LIMIT 5", $vp);
    $vendTotal = scalar($conn, "SELECT COALESCE(SUM(vendor_wallet),0) FROM tbl_vendor WHERE $s AND vendor_wallet > 0", $sp);

    $mapOut = fn($rows) => array_map(fn($x) => [
        'id' => (int)$x['id'], 'name' => $x['name'], 'mobile' => $x['mobile'], 'amount' => (float)$x['amount'], 'last' => $x['last'],
    ], $rows);
    $outstanding = [
        'customers_total' => $custTotal, 'vendors_total' => $vendTotal,
        'customers' => $mapOut($custRows), 'vendors' => $mapOut($vendRows),
    ];

    // ---- Top products ----
    [$ss, $ssp] = scope($ctx, 's');
    [$w, $p] = rangeSql('s.sell_date', 's.c_date', $r);
    $topSql = "SELECT COALESCE(pr.product_name, CONCAT('Product #', d.sell_details_product_id)) name,
                      SUM(d.sell_details_product_qty) qty, SUM(d.sell_details_totall_amount) revenue
                 FROM tbl_sell_details d
                 JOIN tbl_sell s ON s.sell_id = d.sell_details_sell_id
                 LEFT JOIN tbl_product pr ON pr.product_id = d.sell_details_product_id
                WHERE d.is_deleted = " . ACTIVE . " AND $ss AND $w
                GROUP BY d.sell_details_product_id, pr.product_name";
    $mapP = fn($rows) => array_map(fn($x) => ['name' => $x['name'], 'qty' => (float)$x['qty'], 'revenue' => (float)$x['revenue']], $rows);
    $topProducts = [
        'by_revenue' => $mapP(run($conn, "$topSql ORDER BY revenue DESC LIMIT 10", array_merge($ssp, $p))),
        'by_qty'     => $mapP(run($conn, "$topSql ORDER BY qty DESC LIMIT 10", array_merge($ssp, $p))),
    ];

    // ---- Expense by category ----
    [$es, $esp] = scope($ctx, 'e');
    [$w, $p] = rangeSql('e.expense_date', 'e.c_date', $r);
    $expenses = run($conn,
        "SELECT COALESCE(ec.expenses_categories_title, 'Other') name, SUM(e.expense_amount) value
           FROM tbl_expenses e
           LEFT JOIN tbl_expenses_categories ec ON ec.expenses_categories_id = e.expenses_categories_id
          WHERE $es AND $w
          GROUP BY ec.expenses_categories_title
          ORDER BY value DESC", array_merge($esp, $p));

    // ---- Recent orders ----
    [$w, $p] = rangeSql('s.sell_date', 's.c_date', $r);
    $orders = run($conn,
        "SELECT s.sell_id id, s.sell_bill_number invoice_no,
                COALESCE(NULLIF(s.sell_customer_name,''), c.customer_name, 'Walk-in') customer,
                s.sell_total_amount amount, s.sales_total_paid_amount paid, s.sales_total_remainng_amount due,
                s.sell_payment_mode payment_mode, " . dtExpr('s.sell_date', 's.c_date') . " created_at
           FROM tbl_sell s
           LEFT JOIN tbl_customer c ON c.customer_id = s.sell_customer_id
          WHERE $ss AND $w
          ORDER BY created_at DESC, s.sell_id DESC
          LIMIT 8", array_merge($ssp, $p));
    $orders = array_map(function ($o) {
        $paid = (float)$o['paid']; $due = (float)$o['due'];
        return [
            'id' => (int)$o['id'], 'invoice_no' => $o['invoice_no'] ?? '', 'customer' => $o['customer'],
            'amount' => (float)$o['amount'], 'paid' => $paid, 'payment_mode' => $o['payment_mode'] ?? '',
            'created_at' => $o['created_at'],
            'status' => $due <= 0 ? 'Paid' : ($paid > 0 ? 'Partial' : 'Pending'),
        ];
    }, $orders);

    // ---- Low stock (inventory items: purchase-only / both) ----
    $lowStock = (int)scalar($conn,
        "SELECT COUNT(*) FROM tbl_product WHERE $s AND product_is_active = 1 AND product_type IN (2,3) AND product_stock <= ?",
        array_merge($sp, [LOW_STOCK_LIMIT]));

    // ---- Restaurant tables ----
    $statusMap = [1 => 'free', 2 => 'occupied', 3 => 'reserved'];
    $tables = array_map(fn($t) => [
        'id' => (int)$t['id'], 'name' => $t['name'], 'capacity' => (int)$t['capacity'],
        'status' => $statusMap[(int)$t['status']] ?? 'free',
    ], run($conn, "SELECT table_id id, table_no name, table_Capacity capacity, table_status status FROM tbl_table WHERE $s ORDER BY table_id", $sp));

    $minYear = (int)scalar($conn, "SELECT COALESCE(MIN(YEAR(sell_date)), YEAR(CURDATE())) FROM tbl_sell WHERE $s", $sp);

    respond(['success' => true, 'data' => [
        'period' => [
            'from' => $r['from_date'] . ' ' . $r['from_time'], 'to' => $r['to_date'] . ' ' . $r['to_time'],
            'prev_from' => $prev['from_date'] . ' ' . $prev['from_time'], 'prev_to' => $prev['to_date'] . ' ' . $prev['to_time'],
        ],
        'kpis'                => $kpis,
        'low_stock'           => $lowStock,
        'collections'         => $collections,
        'outstanding'         => $outstanding,
        'top_products'        => $topProducts,
        'expense_by_category' => array_map(fn($e) => ['name' => $e['name'], 'value' => (float)$e['value']], $expenses),
        'recent_orders'       => $orders,
        'tables'              => $tables,
        'meta'                => ['min_year' => $minYear, 'server_time' => date('Y-m-d H:i:s'), 'low_stock_limit' => LOW_STOCK_LIMIT],
    ]]);
}

/* ============================================================
 * ACTION: TREND
 * ============================================================ */
function grouped(mysqli $c, array $ctx, string $table, string $dateCol, string $amt, string $fn, string $start, string $end, string $extra = ''): array {
    [$s, $sp] = scope($ctx);
    $rows = run($c,
        "SELECT $fn($dateCol) k, COALESCE(SUM($amt),0) v
           FROM $table WHERE $s AND $dateCol >= ? AND $dateCol < ? $extra
          GROUP BY $fn($dateCol)", array_merge($sp, [$start, $end]));
    $m = [];
    foreach ($rows as $row) $m[(int)$row['k']] = (float)$row['v'];
    return $m;
}

function actionTrend(mysqli $conn): void {
    $ctx    = context();
    $metric = $_GET['metric'] ?? 'sales_purchase';
    $gran   = $_GET['granularity'] ?? 'monthly';
    if (!in_array($metric, ['sales_purchase', 'income_expense'], true)) fail('Invalid metric');
    if (!in_array($gran, ['daily', 'monthly', 'yearly'], true)) fail('Invalid granularity');

    $curYear = (int)date('Y');
    $months  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if ($gran === 'daily') {
        $month = $_GET['month'] ?? date('Y-m');
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) fail('Invalid month. Use YYYY-MM');
        $start = "$month-01";
        $end   = date('Y-m-01', strtotime("$month-01 +1 month"));
        $fn    = 'DAY';
        $keys  = range(1, (int)date('t', strtotime("$month-01")));
        $label = fn($k) => (string)$k;
    } elseif ($gran === 'monthly') {
        $year = (int)($_GET['year'] ?? $curYear);
        if ($year < 2000 || $year > 2100) fail('Invalid year');
        $start = "$year-01-01";
        $end   = ($year + 1) . '-01-01';
        $fn    = 'MONTH';
        $keys  = range(1, 12);
        $label = fn($k) => $months[$k - 1];
    } else {
        $from = (int)($_GET['year'] ?? ($curYear - 4));
        if ($from < 2000 || $from > $curYear) fail('Invalid year');
        $start = "$from-01-01";
        $end   = ($curYear + 1) . '-01-01';
        $fn    = 'YEAR';
        $keys  = range($from, $curYear);
        $label = fn($k) => (string)$k;
    }

    $sales     = grouped($conn, $ctx, 'tbl_sell',     'sell_date',     'sell_total_amount',             $fn, $start, $end);
    $purchases = grouped($conn, $ctx, 'tbl_purchess', 'purchess_date', 'purches_total_with_gst_amount', $fn, $start, $end);

    if ($metric === 'sales_purchase') {
        $a = $sales; $b = $purchases;
    } else {
        // Income  = Sales + Other Income
        // Expense = Purchases + Expenses
        $inc = grouped($conn, $ctx, 'tbl_transaction', 'transaction_date', 'transaction_amount', $fn, $start, $end, 'AND ' . OTHER_INCOME_COND);
        $exp = grouped($conn, $ctx, 'tbl_expenses', 'expense_date', 'expense_amount', $fn, $start, $end);
        $a = []; $b = [];
        foreach ($keys as $k) {
            $a[$k] = ($sales[$k] ?? 0) + ($inc[$k] ?? 0);
            $b[$k] = ($purchases[$k] ?? 0) + ($exp[$k] ?? 0);
        }
    }

    $series = []; $ta = 0; $tb = 0;
    foreach ($keys as $k) {
        $va = round($a[$k] ?? 0, 2); $vb = round($b[$k] ?? 0, 2);
        $ta += $va; $tb += $vb;
        $series[] = ['label' => $label($k), 'a' => $va, 'b' => $vb];
    }

    respond(['success' => true, 'data' => [
        'granularity' => $gran,
        'series'      => $series,
        'totals'      => ['a' => round($ta, 2), 'b' => round($tb, 2)],
    ]]);
}

/* ============================================================
 * ROUTER
 * ============================================================ */
try {
    $action = $_GET['action'] ?? 'summary';
    if ($action === 'summary')    actionSummary($conn);
    elseif ($action === 'trend')  actionTrend($conn);
    else fail('Invalid action', 404);
} catch (Throwable $e) {
    error_log('[dashboard.php] ' . $e->getMessage());
    fail(DASH_DEBUG ? 'Server error: ' . $e->getMessage() : 'Server error', 500);
}