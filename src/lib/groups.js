// Friend groups (tables + functions in supabase/setup.sql). Every helper
// returns null when the tables don't exist yet, so callers can stay hidden.
import { supabase } from "@/lib/supabase";

export async function myGroups(userId) {
  const { data, error } = await supabase.from("group_members").select("group_id, groups(id, name, emoji, invite_code, created_by)").eq("user_id", userId);
  if (error) return null;
  return data.map((r) => r.groups).filter(Boolean);
}

export async function createGroup(name, emoji) {
  const { data, error } = await supabase.rpc("create_group", { p_name: name, p_emoji: emoji });
  if (error) throw error;
  return data; // group id
}

export async function joinGroup(code) {
  const { data, error } = await supabase.rpc("join_group", { p_code: code });
  if (error) throw error;
  return data; // group id
}

export async function groupById(id) {
  const { data, error } = await supabase.from("groups").select("id, name, emoji, invite_code, created_by").eq("id", id).maybeSingle();
  return error ? null : data;
}

// Members with display names: [{ user_id, name, handle, avatar_url }]
export async function groupMembers(groupIds) {
  const ids = [].concat(groupIds);
  const { data, error } = await supabase.from("group_members").select("group_id, user_id").in("group_id", ids);
  if (error || !data.length) return [];
  const { data: profs } = await supabase.from("profiles").select("user_id, display_name, handle, avatar_url").in("user_id", [...new Set(data.map((m) => m.user_id))]);
  const byId = Object.fromEntries((profs || []).map((p) => [p.user_id, p]));
  return data.map((m) => ({ ...m, name: byId[m.user_id]?.display_name || byId[m.user_id]?.handle || "Fan", handle: byId[m.user_id]?.handle, avatar_url: byId[m.user_id]?.avatar_url }));
}

export async function groupMessages(groupId, limit = 60) {
  const { data, error } = await supabase.from("group_messages").select("id, user_id, body, created_at").eq("group_id", groupId).order("created_at", { ascending: false }).limit(limit);
  return error ? [] : data.reverse();
}

export async function postGroupMessage(groupId, userId, body) {
  const { error } = await supabase.from("group_messages").insert({ group_id: groupId, user_id: userId, body });
  if (error) throw error;
}

export async function leaveGroup(groupId, userId) {
  await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
}

export const inviteUrl = (code) => `${typeof window !== "undefined" ? window.location.origin : "https://thenosebleeds.app"}/groups/join/${code}`;
