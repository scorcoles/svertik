// Prettier for the JS tab, loaded only when it is first used (it weighs a few hundred kB).
export async function prettyJS(code: string): Promise<string> {
  const [{ format }, babel, estree] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
  ]);
  return format(code, { parser: 'babel', plugins: [babel, estree], singleQuote: true, printWidth: 100 });
}
