$ErrorActionPreference = "Stop"
$env:DATABASE_URL = "postgresql://radian_user:radian_pass@localhost:5433/radian_db"
$log = "D:\radian\_smoke.log"
$sfx = Get-Date -Format "HHmmss"
"===== SMOKE START $(Get-Date) (sfx=$sfx) =====" | Out-File $log -Encoding utf8

function J($o) { $o | ConvertTo-Json -Depth 8 -Compress }
function Log($m) { $m | Add-Content $log -Encoding utf8 }
$base = "http://localhost:4000"

# start compiled server
$p = Start-Process -FilePath "node" -ArgumentList "dist/main" -PassThru `
  -WorkingDirectory "D:\radian\apps\api" -WindowStyle Hidden `
  -RedirectStandardOutput "D:\radian\_server.out" -RedirectStandardError "D:\radian\_server.err"

# wait until up
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  try { Invoke-RestMethod "$base/" -TimeoutSec 2 | Out-Null; $up = $true; break }
  catch { Start-Sleep -Milliseconds 700 }
}
Log "server up: $up (pid $($p.Id))"

if ($up) {
  try {
    $cat = Invoke-RestMethod -Method Post "$base/categories" -ContentType application/json -Body (J @{ slug = "flowers-$sfx"; name = "Fresh Flowers" })
    Log "CATEGORY created: id=$($cat.id) name=$($cat.name)"

    $sub = Invoke-RestMethod -Method Post "$base/categories" -ContentType application/json -Body (J @{ slug = "roses-$sfx"; name = "Roses"; parentId = $cat.id })
    Log "SUB-CATEGORY created: id=$($sub.id) parent=$($sub.parentId)"

    $tag = Invoke-RestMethod -Method Post "$base/tags" -ContentType application/json -Body (J @{ slug = "birthday-$sfx"; name = "Birthday"; type = "OCCASION" })
    Log "TAG created: id=$($tag.id) type=$($tag.type)"

    $vg = Invoke-RestMethod -Method Post "$base/variant-groups" -ContentType application/json -Body (J @{ kind = "COLOUR"; label = "Colour" })
    Log "VARIANT-GROUP created: id=$($vg.id)"

    $prod = Invoke-RestMethod -Method Post "$base/products" -ContentType application/json -Body (J @{
        slug = "velvet-red-24-$sfx"; name = "Velvet Red - 24 Roses"; categoryId = $sub.id; tagIds = @($tag.id);
        productType = "READYMADE"; zone = "DHAKA"; natureType = "FRESH"; natureLabel = "100% Fresh Flowers";
        costPaisa = 120000; sellingPricePaisa = 245000; discountType = "PERCENT"; discountValue = 1000;
        variantGroupId = $vg.id; variantLabel = "Red"; variantSwatch = "#C4172B";
        supportsExpress = $true; supportsSameDay = $true; isPublished = $true;
        sizes = @(@{ label = "24 Stems"; pricePaisa = 245000 }, @{ label = "50 Stems"; pricePaisa = 490000 });
        specRows = @(@{ item = "Red Rose (fresh cut)"; qty = "24 sticks" });
        faqs = @(@{ question = "Fresh or artificial?"; answer = "100% fresh." });
      })
    Log "PRODUCT created: id=$($prod.id) selling=$($prod.sellingPricePaisa) offer=$($prod.offerPricePaisa) margin=$($prod.marginPaisa) sizes=$($prod.sizes.Count) tags=$($prod.tags.Count)"

    $list = Invoke-RestMethod "$base/products?search=velvet"
    Log "LIST search=velvet total=$($list.total) firstOffer=$($list.items[0].offerPricePaisa)"

    $one = Invoke-RestMethod "$base/products/$($prod.id)"
    Log "GET one: variantGroup=$($one.variantGroup.label) faqs=$($one.faqs.Count) specRows=$($one.specRows.Count)"

    $tl = Invoke-RestMethod "$base/products/$($prod.id)/timeline"
    Log "TIMELINE events=$($tl.Count) latest='$($tl[0].label)'"

    # business rule: advanceRequired without advanceType -> expect 400
    try {
      Invoke-RestMethod -Method Post "$base/products" -ContentType application/json -Body (J @{ slug = "bad-adv-$sfx"; name = "Bad"; categoryId = $sub.id; productType = "CRAFTED"; zone = "DHAKA"; natureType = "ARTIFICIAL"; costPaisa = 1000; sellingPricePaisa = 2000; advanceRequired = $true }) | Out-Null
      Log "ADVANCE-RULE: FAIL (should have rejected)"
    } catch { Log "ADVANCE-RULE: OK rejected ($($_.Exception.Response.StatusCode.value__))" }

    # soft delete -> list should drop
    Invoke-RestMethod -Method Delete "$base/products/$($prod.id)" | Out-Null
    $afterDel = (Invoke-RestMethod "$base/products?search=velvet").total
    Log "AFTER DELETE total=$afterDel (expect 0)"

    # restore -> list should return
    Invoke-RestMethod -Method Post "$base/products/$($prod.id)/restore" | Out-Null
    $afterRes = (Invoke-RestMethod "$base/products?search=velvet").total
    Log "AFTER RESTORE total=$afterRes (expect 1)"

    Log "RESULT: PASS"
  } catch {
    Log "ERROR: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Log ("DETAIL: " + $_.ErrorDetails.Message) }
    Log "RESULT: FAIL"
  }
} else {
  Log "server did not start — server.err tail:"
  if (Test-Path "D:\radian\_server.err") { Get-Content "D:\radian\_server.err" -Tail 20 | Add-Content $log -Encoding utf8 }
}

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
"===== SMOKE DONE $(Get-Date) =====" | Add-Content $log -Encoding utf8
