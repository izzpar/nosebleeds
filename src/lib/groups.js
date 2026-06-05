// Mini-league ("group") helpers for the public games (ranking, salary).
import { sbFetch, sbJson, sbInsert } from "@/lib/sbrest";

export function makeGroupCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Groups (for a given game) that this user belongs to.
export async function fetchMyGroups(userId, game) {
  const res = await sbFetch(`wc_group_members?user_id=eq.${userId}&select=group_id,wc_groups(*)`);
  const rows = await sbJson(res);
  return rows.map((r) => r.wc_groups).filter((g) => g && g.game === game);
}

export async function createGroup(name, game, userId, profile, maxEntries = 1) {
  let { res, rows } = await sbInsert("wc_groups", {
    name: name.trim(), invite_code: makeGroupCode(), game, creator_id: userId,
    max_entries: Math.max(1, Math.min(10, Number(maxEntries) || 1)),
  });
  if (!res.ok) {
    // max_entries column may not exist yet — fall back.
    ({ res, rows } = await sbInsert("wc_groups", {
      name: name.trim(), invite_code: makeGroupCode(), game, creator_id: userId,
    }));
  }
  const g = rows[0];
  if (g) {
    await sbInsert("wc_group_members", {
      group_id: g.id, user_id: userId, handle: profile?.handle,
      display_name: profile?.display_name || profile?.handle,
    });
  }
  return g;
}

export async function groupByCode(code) {
  const res = await sbFetch(`wc_groups?invite_code=eq.${code.toUpperCase()}&select=*`);
  return (await sbJson(res))[0] || null;
}

export async function groupById(id) {
  const res = await sbFetch(`wc_groups?id=eq.${id}&select=*`);
  return (await sbJson(res))[0] || null;
}

export async function joinGroup(group, userId, profile) {
  const ins = await sbInsert("wc_group_members", {
    group_id: group.id, user_id: userId, handle: profile?.handle,
    display_name: profile?.display_name || profile?.handle,
  });
  return ins.res.ok || ins.res.status === 409; // 409 = already a member
}

export async function groupMemberIds(groupId) {
  const res = await sbFetch(`wc_group_members?group_id=eq.${groupId}&select=user_id`);
  return (await sbJson(res)).map((r) => r.user_id);
}
