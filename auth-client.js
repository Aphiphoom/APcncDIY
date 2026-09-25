(() => {
  "use strict";

  const w = window;
  const timeoutMs = 10000;

  if (!w.supabase || !w.SUPABASE_URL || !w.SUPABASE_ANON_KEY) {
    console.error("ยังไม่ได้ตั้งค่า Supabase สำหรับหน้าเว็บ");
    return;
  }

  const client = w.supabase.createClient(w.SUPABASE_URL, w.SUPABASE_ANON_KEY);

  function withTimeout(promise, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`${label}-timeout`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  async function getUser() {
    try {
      const result = await withTimeout(client.auth.getUser(), "auth");
      if (result.error) throw result.error;
      return result.data && result.data.user ? result.data.user : null;
    } catch (error) {
      console.warn("ตรวจสอบสถานะเข้าสู่ระบบไม่สำเร็จ", error);
      return null;
    }
  }

  async function requireLogin() {
    const user = await getUser();
    if (user) return user;

    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`login.html?next=${next}`);
    return null;
  }

  async function getMyProfile() {
    const user = await getUser();
    if (!user) return null;

    try {
      const result = await withTimeout(
        client.from("profiles").select("*").eq("id", user.id).single(),
        "profile"
      );
      if (result.error) throw result.error;
      return result.data || null;
    } catch (error) {
      console.warn("โหลดข้อมูลสิทธิ์สมาชิกไม่สำเร็จ", error);
      return null;
    }
  }

  w.AuthClient = {
    sb: client,
    getUser,
    requireLogin,
    getMyProfile,
    logout: async () => {
      try { await withTimeout(client.auth.signOut(), "logout"); } catch (_) {}
      location.replace("login.html");
    }
  };
})();
