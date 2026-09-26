(() => {
  "use strict";

  const w = window;
  const timeoutMs = 10000;
  const inSketchUp = !!(w.sketchup && typeof w.sketchup.account_auth_load === "function");
  let bridgeReady = !inSketchUp;
  let bridgeResolve = null;
  let bridgePromise = null;

  if (!w.supabase || !w.SUPABASE_URL || !w.SUPABASE_ANON_KEY) {
    console.error("ยังไม่ได้ตั้งค่า Supabase สำหรับหน้าเว็บ");
    return;
  }

  const client = w.supabase.createClient(w.SUPABASE_URL, w.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: !inSketchUp,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  function withTimeout(promise, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`${label}-timeout`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  function ensureBridgeSession() {
    if (!inSketchUp || bridgeReady) return Promise.resolve();
    if (bridgePromise) return bridgePromise;
    bridgePromise = new Promise((resolve) => {
      bridgeResolve = resolve;
      try {
        w.sketchup.account_auth_load();
      } catch (_) {
        bridgeReady = true;
        resolve();
      }
    });
    return withTimeout(bridgePromise, "sketchup-session").catch(() => {});
  }

  async function receiveStoredSession(session) {
    try {
      if (session && session.access_token && session.refresh_token) {
        const result = await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        if (result.error) throw result.error;
      }
    } catch (error) {
      console.warn("กู้คืน Session จาก SketchUp ไม่สำเร็จ", error);
    } finally {
      bridgeReady = true;
      if (bridgeResolve) bridgeResolve();
      bridgeResolve = null;
    }
  }

  async function getUser() {
    try {
      await ensureBridgeSession();
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
    receiveStoredSession,
    logout: async () => {
      try { await withTimeout(client.auth.signOut(), "logout"); } catch (_) {}
      if (inSketchUp && w.sketchup && typeof w.sketchup.account_clear_session === "function") {
        try { w.sketchup.account_clear_session(); } catch (_) {}
      }
      location.replace("login.html");
    }
  };
})();
