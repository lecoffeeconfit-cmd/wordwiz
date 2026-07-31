import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUDGE_TYPES = new Set(['study_reminder', 'streak_reminder', 'five_word_challenge', 'encouragement']);
const NUDGE_MESSAGES: Record<string, { nudgeType: string; title: string }> = {
  time_for_review: { nudgeType: 'study_reminder', title: 'Time for a quick word review!' },
  brain_workout: { nudgeType: 'study_reminder', title: 'Give your brain a WordWiz workout' },
  flashcards_waiting: { nudgeType: 'study_reminder', title: 'Your flashcards are waiting' },
  review_before_fade: { nudgeType: 'study_reminder', title: 'Review your words before they fade' },
  omega_challenge: { nudgeType: 'five_word_challenge', title: 'I challenge you to an Omega Test' },
  quiz_today: { nudgeType: 'five_word_challenge', title: 'Can you complete a quiz today?' },
  perfect_quiz: { nudgeType: 'five_word_challenge', title: 'Try to earn a perfect quiz score' },
  five_minute_session: { nudgeType: 'five_word_challenge', title: 'I challenge you to a 5-minute study session' },
  leaderboard_spot: { nudgeType: 'five_word_challenge', title: 'I’m coming for your leaderboard spot' },
  race_next_level: { nudgeType: 'five_word_challenge', title: 'Race me to the next WordWiz level' },
  who_knows_more: { nudgeType: 'five_word_challenge', title: 'Let’s see who knows more words' },
  spot_not_safe: { nudgeType: 'five_word_challenge', title: 'Your leaderboard spot isn’t safe' },
  you_got_this: { nudgeType: 'encouragement', title: 'You’ve got this, WordWiz!' },
  keep_streak_alive: { nudgeType: 'streak_reminder', title: 'Keep your learning streak alive' },
  keep_building: { nudgeType: 'encouragement', title: 'Keep building that vocabulary' },
  one_more_word: { nudgeType: 'encouragement', title: 'One more word brings you closer' },
  great_job: { nudgeType: 'encouragement', title: 'Great job—keep it going!' },
  vocabulary_growing: { nudgeType: 'encouragement', title: 'Your vocabulary is growing' },
  true_wordwiz: { nudgeType: 'encouragement', title: 'You’re becoming a true WordWiz' },
  big_brain: { nudgeType: 'encouragement', title: 'Big brain energy!' },
  happy_learning: { nudgeType: 'encouragement', title: 'Happy word learning!' },
  powers_training: { nudgeType: 'study_reminder', title: 'Your WordWiz powers need training' },
  officially_nudged: { nudgeType: 'study_reminder', title: 'You’ve been officially nudged to study' },
  new_word_waiting: { nudgeType: 'study_reminder', title: 'A new word is waiting for you' },
  learn_a_word: { nudgeType: 'encouragement', title: '📚 Time to learn a word!' },
  you_got_this: { nudgeType: 'encouragement', title: '🌟 You’ve got this!' },
  magic_workout: { nudgeType: 'encouragement', title: '✨ Give your WordWiz magic a quick workout' },
  keep_building: { nudgeType: 'encouragement', title: '💪 Keep building that vocabulary' },
  few_minutes: { nudgeType: 'encouragement', title: '🚀 A few minutes can make a difference' },
  learn_today: { nudgeType: 'encouragement', title: '✨ Learn something new today' },
  keep_momentum: { nudgeType: 'streak_reminder', title: '🔥 Keep your momentum going' },
  next_word_waiting: { nudgeType: 'study_reminder', title: '🎯 Your next word is waiting' },
  study_break: { nudgeType: 'study_reminder', title: '⏰ Study break?' },
  quick_review: { nudgeType: 'study_reminder', title: '📝 Time for a quick review' },
  flashcards_miss_you: { nudgeType: 'study_reminder', title: '🃏 Your flashcards miss you' },
  quick_quiz: { nudgeType: 'study_reminder', title: '🧩 Ready for a quick quiz?' },
  todays_words: { nudgeType: 'study_reminder', title: '📖 Don’t forget today’s words' },
  review_before_forget: { nudgeType: 'study_reminder', title: '🔁 Review before you forget' },
  recharge_spellbook: { nudgeType: 'study_reminder', title: '🔮 Recharge your WordWiz spellbook' },
  new_word_day: { nudgeType: 'study_reminder', title: '☀️ Start your day with a new word' },
  last_review: { nudgeType: 'study_reminder', title: '🌙 One last review before bed' },
  leaderboard_spot: { nudgeType: 'five_word_challenge', title: '🏆 I’m coming for your leaderboard spot' },
  right_behind: { nudgeType: 'five_word_challenge', title: '👀 I’m right behind you' },
  catch_me: { nudgeType: 'five_word_challenge', title: '⚡ Catch me if you can' },
  leaderboard_heating: { nudgeType: 'five_word_challenge', title: '🔥 The leaderboard is heating up' },
  beat_score: { nudgeType: 'five_word_challenge', title: '😏 Think you can beat my score?' },
  quiz_challenge: { nudgeType: 'five_word_challenge', title: '🎯 Quiz challenge incoming' },
  who_knows_more: { nudgeType: 'five_word_challenge', title: '🧠 Let’s see who knows more words' },
  race_next_level: { nudgeType: 'five_word_challenge', title: '🚀 Race you to the next level' },
  top_spot_safe: { nudgeType: 'five_word_challenge', title: '👑 Your top spot isn’t safe' },
  passed_you: { nudgeType: 'five_word_challenge', title: '💥 I just passed you!' },
  challenge_quiz: { nudgeType: 'five_word_challenge', title: '⚔️ I challenge you to a quiz' },
  one_quiz_today: { nudgeType: 'five_word_challenge', title: '🧩 Complete one quiz today' },
  three_words: { nudgeType: 'five_word_challenge', title: '📚 Learn three new words with me' },
  five_minutes: { nudgeType: 'five_word_challenge', title: '⏱️ Five-minute study challenge' },
  streak_today: { nudgeType: 'streak_reminder', title: '🔥 Keep your streak alive today' },
  earn_xp: { nudgeType: 'five_word_challenge', title: '🎯 Try to earn 100 XP' },
  flashcard_round: { nudgeType: 'five_word_challenge', title: '🃏 Finish a flashcard round' },
  race_rank: { nudgeType: 'five_word_challenge', title: '🏁 Race me to the next rank' },
  difficult_word: { nudgeType: 'five_word_challenge', title: '💡 Learn one difficult word today' },
  perfect_quiz: { nudgeType: 'five_word_challenge', title: '🧠 Can you get a perfect quiz score?' },
  nice_work: { nudgeType: 'encouragement', title: '🎉 Nice work!' },
  crushing_it: { nudgeType: 'encouragement', title: '🥳 You’re crushing it' },
  great_quiz_score: { nudgeType: 'encouragement', title: '👏 Great quiz score!' },
  vocabulary_growing: { nudgeType: 'encouragement', title: '🌟 Your vocabulary is growing' },
  streak_impressive: { nudgeType: 'encouragement', title: '🔥 That streak is impressive' },
  leaderboard_legend: { nudgeType: 'encouragement', title: '🏆 Leaderboard legend' },
  perfect_score: { nudgeType: 'encouragement', title: '💯 Perfect score!' },
  leveled_up: { nudgeType: 'encouragement', title: '🚀 You just leveled up' },
  word_master: { nudgeType: 'encouragement', title: '👑 Word master in the making' },
  spellbinding_energy: { nudgeType: 'encouragement', title: '✨ Spellbinding energy!' },
  wordwiz_misses_you: { nudgeType: 'study_reminder', title: '👋 WordWiz misses you' },
  comeback_word: { nudgeType: 'study_reminder', title: '🌱 Every comeback starts with one word' },
  restart_streak: { nudgeType: 'streak_reminder', title: '🔄 Ready to restart your streak?' },
  never_late: { nudgeType: 'encouragement', title: '💪 It’s never too late to study' },
  jump_back: { nudgeType: 'study_reminder', title: '📚 Jump back in with a quick review' },
  fresh_start: { nudgeType: 'encouragement', title: '✨ A fresh start is waiting' },
  wake_magic: { nudgeType: 'study_reminder', title: '🪄 Wake up your WordWiz magic' },
  back_leaderboard: { nudgeType: 'five_word_challenge', title: '🚀 Let’s get you back on the leaderboard' },
  owl_demands: { nudgeType: 'study_reminder', title: '🦉 The WordWiz owl demands knowledge' },
  spellbook_called: { nudgeType: 'study_reminder', title: '📜 Your spellbook called—it wants new words' },
  vocabulary_asleep: { nudgeType: 'study_reminder', title: '💤 Don’t let your vocabulary fall asleep' },
  scramble_words: { nudgeType: 'study_reminder', title: '🍳 Time to scramble some words' },
  nerd_mode: { nudgeType: 'encouragement', title: '🤓 Nerd mode: activated' },
  unstoppable: { nudgeType: 'encouragement', title: '📖 Open WordWiz. Become unstoppable.' },
  avoiding_flashcards: { nudgeType: 'study_reminder', title: '👀 I saw you avoiding your flashcards' },
  yes_you: { nudgeType: 'study_reminder', title: '🫵 Yes, you. Go study.' },
  one_quiz_hurt: { nudgeType: 'five_word_challenge', title: '😂 One quiz won’t hurt' },
  powers_training: { nudgeType: 'study_reminder', title: '🧙 Your word powers need training' },
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function projectKey(variableName: string) {
  const raw = Deno.env.get(variableName);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed.default === 'string' ? parsed.default : Object.values(parsed).find((value): value is string => typeof value === 'string' && value.length > 0);
  } catch { return undefined; }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = projectKey('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = projectKey('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('authorization');
  if (!url || !anonKey || !serviceKey) return response({ error: 'Community service is not configured' }, 500);
  if (!authorization) return response({ error: 'Sign in is required' }, 401);

  let body: { recipientPublicId?: string; nudgeType?: string; messageKey?: string; idempotencyKey?: string };
  try { body = await request.json(); } catch { return response({ error: 'Invalid request' }, 400); }
  if (!body.recipientPublicId || !UUID_PATTERN.test(body.recipientPublicId) || !body.nudgeType || !NUDGE_TYPES.has(body.nudgeType)) {
    return response({ error: 'Invalid nudge request' }, 400);
  }
  const messageKey = body.messageKey ?? 'time_for_review';
  const messageTemplate = NUDGE_MESSAGES[messageKey];
  if (!messageTemplate || messageTemplate.nudgeType !== body.nudgeType) {
    return response({ error: 'Invalid nudge message' }, 400);
  }
  const idempotencyKey = body.idempotencyKey && UUID_PATTERN.test(body.idempotencyKey) ? body.idempotencyKey : crypto.randomUUID();
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: 'Sign in is required' }, 401);

  const { error: nudgeError } = await userClient.rpc('community_create_nudge', {
    p_recipient_public_id: body.recipientPublicId,
    p_nudge_type: body.nudgeType,
    p_message_key: messageKey,
    p_idempotency_key: idempotencyKey,
  });
  if (nudgeError) return response({ error: 'That nudge cannot be sent right now' }, 400);

  const adminClient = createClient(url, serviceKey);
  const { data: recipient, error: recipientError } = await adminClient
    .from('community_profiles')
    .select('user_id,push_nudges_enabled')
    .eq('public_id', body.recipientPublicId)
    .maybeSingle();
  if (recipientError || !recipient?.push_nudges_enabled) return response({ queued: true, push: 'not_requested' });

  const { data: tokens } = await adminClient
    .from('community_push_tokens')
    .select('expo_push_token')
    .eq('user_id', recipient.user_id)
    .eq('active', true);
  if (!tokens?.length) return response({ queued: true, push: 'not_registered' });

  const title = body.nudgeType === 'five_word_challenge' ? 'A WordWiz challenge is waiting' : 'A friend nudged you in WordWiz';
  const message = messageTemplate.title;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;
  try {
    const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers,
      body: JSON.stringify(tokens.map((token) => ({ to: token.expo_push_token, sound: 'default', title, body: message, data: { destination: 'community', type: 'nudge' }, channelId: 'study-nudges' }))),
    });
    if (!pushResponse.ok) return response({ queued: true, push: 'queued_for_retry' });
  } catch {
    return response({ queued: true, push: 'queued_for_retry' });
  }
  return response({ queued: true, push: 'sent' });
});
