(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let sb;
  let members = [];
  let selectedId = null;
  let searchText = "";

  const statusLabel = (status) => ({
    pending: "รออนุมัติ",
    active: "ใช้งานได้",
    suspended: "ระงับสิทธิ์"
  })[status] || status;

  function visibleMembers() {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) return members;
    return members.filter((member) => (member.email || "").toLocaleLowerCase().includes(query));
  }

  function remainingDays(expiresAt) {
    if (!expiresAt) return "ไม่จำกัด";
    const expiry = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiry)) return "—";
    const diff = expiry - Date.now();
    if (diff < 0) return "หมดอายุ";
    return `${Math.max(0, Math.ceil(diff / 86400000))} วัน`;
  }

  function renderMembers() {
    const body = $("userTableBody");
    const rows = visibleMembers();
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="3" class="empty-hint">${members.length ? "ไม่พบสมาชิกที่ค้นหา" : "ยังไม่มีสมาชิก"}</td></tr>`;
      return;
    }

    body.innerHTML = "";
    rows.forEach((member) => {
      const row = document.createElement("tr");
      const expired = member.expiresAt && new Date(member.expiresAt).getTime() < Date.now();
      const shownStatus = expired ? "suspended" : member.status;
      row.dataset.id = member.id;
      row.classList.toggle("selected-member", member.id === selectedId);
      row.title = member.email || "";

      const emailCell = document.createElement("td");
      emailCell.textContent = member.email || "—";
      const statusCell = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = `status-pill status-${shownStatus}`;
      pill.textContent = expired ? "หมดอายุ" : statusLabel(member.status);
      statusCell.appendChild(pill);
      const daysCell = document.createElement("td");
      daysCell.textContent = remainingDays(member.expiresAt);
      row.append(emailCell, daysCell, statusCell);
      row.addEventListener("click", () => selectMember(member));
      body.appendChild(row);
    });
  }

  async function loadLoginLogs(userId) {
    const body = $("logTableBody");
    body.innerHTML = '<tr><td colspan="5" class="empty-hint">กำลังโหลด...</td></tr>';
    const { data, error } = await sb.from("login_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) {
      body.innerHTML = `<tr><td colspan="5" class="empty-hint">โหลด log ไม่สำเร็จ: ${error.message}</td></tr>`;
      return;
    }
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-hint">ยังไม่มีประวัติการ login</td></tr>';
      return;
    }

    body.innerHTML = "";
    data.forEach((log) => {
      const row = document.createElement("tr");
      if (log.flagged) row.classList.add("flagged-row");
      const values = [
        log.flagged ? "⚠" : "",
        new Date(log.created_at).toLocaleString("th-TH"),
        log.ip || "—",
        `${log.city || "ไม่ทราบ"}, ${log.country || "ไม่ทราบ"}`,
        (log.user_agent || "").slice(0, 28) + "..."
      ];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 4) {
          cell.className = "ua-cell";
          cell.title = log.user_agent || "";
        }
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  }

  function selectMember(member) {
    selectedId = member.id;
    $("detailEmail").textContent = member.email || "—";
    $("detailStatus").value = member.status;
    $("detailExpires").value = member.expiresAt ? member.expiresAt.slice(0, 10) : "";
    $("detailRole").value = member.role;
    $("detailSellerLevel").value = String(member.sellerLevel);
    $("detailCredits").value = member.credits.toLocaleString("th-TH");
    updateSellerHint();
    $("saveUserMsg").textContent = "";
    $("creditMsg").textContent = "";
    renderMembers();
    loadLoginLogs(member.id);
  }

  async function loadMembers() {
    $("userTableBody").innerHTML = '<tr><td colspan="3" class="empty-hint">กำลังโหลด...</td></tr>';
    const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) {
      $("userTableBody").innerHTML = `<tr><td colspan="3" class="empty-hint">โหลดไม่สำเร็จ: ${error.message}</td></tr>`;
      return;
    }

    members = data.map((profile) => ({
      id: profile.id,
      email: profile.email,
      role: profile.role,
      status: profile.status,
      expiresAt: profile.expires_at,
      sellerLevel: Number(profile.seller_level || 0),
      credits: Number(profile.credit_balance || 0),
      createdAt: profile.created_at
    }));
    renderMembers();

    const memberToShow = members.find((member) => member.id === selectedId) || members[0];
    if (memberToShow) selectMember(memberToShow);
    else {
      selectedId = null;
      $("detailEmail").textContent = "ยังไม่มีสมาชิก";
      $("logTableBody").innerHTML = '<tr><td colspan="5" class="empty-hint">ยังไม่มีสมาชิก</td></tr>';
    }
  }

  async function saveMember() {
    if (!selectedId) return;
    $("saveUserMsg").textContent = "กำลังบันทึก...";
    const expiresAt = $("detailExpires").value ? new Date($("detailExpires").value + "T23:59:59Z").toISOString() : null;
    const { error } = await sb.from("profiles").update({
      status: $("detailStatus").value,
      role: $("detailRole").value,
      seller_level: Number($("detailSellerLevel").value),
      expires_at: expiresAt
    }).eq("id", selectedId);
    if (error) {
      $("saveUserMsg").textContent = "⚠ บันทึกไม่สำเร็จ: " + error.message;
      return;
    }
    $("saveUserMsg").textContent = "✓ บันทึกแล้ว (มีผลตอนสมาชิก login ครั้งถัดไป)";
    await loadMembers();
  }

  async function adjustCredit(direction) {
    if (!selectedId) return;
    const amount = Math.trunc(Number($("creditAmount").value));
    const reason = $("creditReason").value.trim();
    if (!Number.isFinite(amount) || amount <= 0) return void($("creditMsg").textContent = "⚠ กรุณาระบุจำนวนเครดิตมากกว่า 0");
    if (!reason) return void($("creditMsg").textContent = "⚠ กรุณาระบุหมายเหตุ");
    $("creditMsg").textContent = "กำลังปรับเครดิต...";
    const { data, error } = await sb.rpc("admin_adjust_credit", { p_user_id: selectedId, p_delta: direction * amount, p_reason: reason });
    if (error) return void($("creditMsg").textContent = "⚠ ปรับเครดิตไม่สำเร็จ: " + error.message);
    $("creditMsg").textContent = "✓ เครดิตคงเหลือ " + Number(data || 0).toLocaleString("th-TH");
    $("creditReason").value = "";
    await loadMembers();
  }

  function updateSellerHint() {
    const role = $("detailRole").value;
    const level = Number($("detailSellerLevel").value);
    $("sellerLimitHint").textContent = role === "admin" ? "Admin ลงสินค้าได้ไม่จำกัด" : (["ลงขายไม่ได้", "ลงขายได้สูงสุด 5 ชิ้น", "ลงขายได้สูงสุด 25 ชิ้น", "ลงขายได้สูงสุด 50 ชิ้น"][level] || "ลงขายไม่ได้");
  }

  (async function init() {
    sb = window.AuthClient.sb;
    const user = await window.AuthClient.requireLogin();
    if (!user) return;
    const profile = await window.AuthClient.getMyProfile();
    if (!profile || profile.role !== "admin") {
      $("accessMsg").textContent = "หน้านี้สำหรับแอดมินเท่านั้น — บัญชีของคุณไม่มีสิทธิ์เข้าถึง";
      return;
    }

    $("accessGate").style.display = "none";
    $("appRoot").style.display = "";
    $("userEmail").textContent = user.email;
    $("btnLogout").addEventListener("click", () => window.AuthClient.logout());
    $("btnRefresh").addEventListener("click", loadMembers);
    $("btnSaveUser").addEventListener("click", saveMember);
    $("btnCreditAdd").addEventListener("click", () => adjustCredit(1));
    $("btnCreditSubtract").addEventListener("click", () => adjustCredit(-1));
    $("detailSellerLevel").addEventListener("change", updateSellerHint);
    $("detailRole").addEventListener("change", updateSellerHint);
    $("memberSearch").addEventListener("input", (event) => {
      searchText = event.target.value;
      renderMembers();
    });
    await loadMembers();
  })();
})();
