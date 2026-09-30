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

  function isExpired(member) {
    if (!member || !member.expiresAt) return false;
    const expiry = new Date(member.expiresAt).getTime();
    return Number.isFinite(expiry) && expiry < Date.now();
  }

  function sortedMembers(source) {
    return [...source].sort((a, b) => {
      const expiredDiff = Number(isExpired(a)) - Number(isExpired(b));
      if (expiredDiff !== 0) return expiredDiff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }

  function visibleMembers() {
    const query = searchText.trim().toLocaleLowerCase();
    const byId = new Map(members.map((member) => [member.id, member]));
    const childIds = new Set(members.filter((member) => member.memberType === "child").map((member) => member.id));
    let roots = sortedMembers(members.filter((member) => !childIds.has(member.id)));

    if (query) {
      const matches = new Set();
      members.forEach((member) => {
        const haystack = [member.email, member.enterpriseName, member.accountType].filter(Boolean).join(" ").toLocaleLowerCase();
        if (haystack.includes(query)) {
          matches.add(member.id);
          if (member.parentId) matches.add(member.parentId);
        }
      });
      roots = roots.filter((root) => matches.has(root.id) || members.some((child) => child.parentId === root.id && matches.has(child.id)));
    }

    const rows = [];
    roots.forEach((root) => {
      rows.push(root);
      const children = sortedMembers(members.filter((member) => member.parentId === root.id));
      const visibleChildren = query ? children.filter((child) => {
        const haystack = [child.email, child.enterpriseName, child.accountType].filter(Boolean).join(" ").toLocaleLowerCase();
        return haystack.includes(query) || matchesParent(root, query);
      }) : children;
      visibleChildren.forEach((child, index) => {
        child.treeLast = index === visibleChildren.length - 1;
        rows.push(child);
      });
    });

    return rows;
  }

  function matchesParent(member, query) {
    return [member.email, member.enterpriseName, member.accountType].filter(Boolean).join(" ").toLocaleLowerCase().includes(query);
  }

  function updateMemberCount() {
    const count = $("memberCount");
    if (count) count.textContent = members.length.toLocaleString("th-TH");
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
    updateMemberCount();
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="3" class="empty-hint">${members.length ? "ไม่พบสมาชิกที่ค้นหา" : "ยังไม่มีสมาชิก"}</td></tr>`;
      return;
    }

    body.innerHTML = "";
    rows.forEach((member) => {
      const row = document.createElement("tr");
      const expired = isExpired(member);
      const shownStatus = expired ? "suspended" : member.status;
      const isChild = member.memberType === "child";
      row.dataset.id = member.id;
      row.classList.toggle("selected-member", member.id === selectedId);
      row.classList.toggle("expired-member", expired);
      row.classList.toggle("enterprise-child-row", isChild);
      row.title = member.email || "";
      if (isChild) row.style.background = "rgba(37,200,213,.035)";

      const emailCell = document.createElement("td");
      if (isChild) {
        emailCell.style.paddingLeft = "22px";
        const branch = document.createElement("span");
        branch.textContent = member.treeLast ? "└─ " : "├─ ";
        branch.style.color = "var(--cyan)";
        branch.style.opacity = ".78";
        branch.style.fontFamily = "monospace";
        emailCell.appendChild(branch);
      } else if (member.accountType === "enterprise") {
        const marker = document.createElement("span");
        marker.textContent = "▾ ";
        marker.style.color = "var(--amber)";
        marker.style.fontSize = "11px";
        emailCell.appendChild(marker);
      }
      const emailText = document.createElement("span");
      emailText.textContent = member.email || "—";
      emailCell.appendChild(emailText);
      if (member.accountType === "enterprise" && member.enterpriseName) {
        const company = document.createElement("div");
        company.textContent = member.enterpriseName;
        company.style.fontSize = "10px";
        company.style.color = "var(--ink-faint)";
        company.style.marginTop = "2px";
        emailCell.appendChild(company);
      }

      const statusCell = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = `status-pill status-${shownStatus}`;
      pill.textContent = expired ? "หมดอายุ" : statusLabel(member.status);
      statusCell.appendChild(pill);
      const daysCell = document.createElement("td");
      daysCell.textContent = remainingDays(member.expiresAt);
      if (isChild) {
        daysCell.title = "วันหมดอายุตาม Enterprise ID หลัก";
        daysCell.style.color = "var(--ink-faint)";
      }
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
    const [profileResult, memberResult, accountResult] = await Promise.all([
      sb.from("profiles").select("*").order("created_at", { ascending: false }),
      sb.from("enterprise_members").select("enterprise_id,user_id,member_type"),
      sb.from("enterprise_accounts").select("id,name,primary_user_id")
    ]);
    if (profileResult.error) {
      $("userTableBody").innerHTML = `<tr><td colspan="3" class="empty-hint">โหลดไม่สำเร็จ: ${profileResult.error.message}</td></tr>`;
      return;
    }

    const links = memberResult.error ? [] : (memberResult.data || []);
    const accounts = accountResult.error ? [] : (accountResult.data || []);
    const linkByUser = new Map(links.map((link) => [link.user_id, link]));
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    members = profileResult.data.map((profile) => {
      const link = linkByUser.get(profile.id) || null;
      const account = link ? accountById.get(link.enterprise_id) : null;
      return {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        status: profile.status,
        accountType: profile.account_type || "customer",
        expiresAt: profile.expires_at,
        sellerLevel: Number(profile.seller_level || 0),
        credits: Number(profile.credit_balance || 0),
        createdAt: profile.created_at,
        enterpriseId: link?.enterprise_id || null,
        memberType: link?.member_type || null,
        enterpriseName: account?.name || null,
        parentId: link?.member_type === "child" ? (account?.primary_user_id || null) : null
      };
    });
    updateMemberCount();
    renderMembers();

    const ordered = visibleMembers();
    const memberToShow = members.find((member) => member.id === selectedId) || ordered[0];
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
    let profile;
    try {
      const profileRequest = sb.from("profiles").select("role,status,account_type").eq("id", user.id).maybeSingle();
      const profileResult = await Promise.race([
        profileRequest,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("profile-timeout")), 12000))
      ]);
      if (profileResult.error) throw profileResult.error;
      profile = profileResult.data;
    } catch (error) {
      console.warn("ตรวจสอบสิทธิ์แอดมินไม่สำเร็จ", error);
      $("accessMsg").textContent = "ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง";
      return;
    }
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
