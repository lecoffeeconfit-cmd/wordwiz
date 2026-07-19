const forbiddenPublicSecrets = [
  'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'EXPO_PUBLIC_SERVICE_ROLE_KEY',
  'EXPO_PUBLIC_OPENAI_API_KEY',
  'EXPO_PUBLIC_WORDNIK_API_KEY',
  'EXPO_PUBLIC_SECRET_KEY',
];

const exposedSecrets = forbiddenPublicSecrets.filter((name) => Boolean(process.env[name]?.trim()));

if (exposedSecrets.length > 0) {
  console.error(
    `Refusing to build: ${exposedSecrets.join(', ')} must not use the EXPO_PUBLIC_ prefix. ` +
      'Move private values to Supabase Edge Function secrets or another server-side environment.',
  );
  process.exit(1);
}

console.log('Public environment variable check passed.');
