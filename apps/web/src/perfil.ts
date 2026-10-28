// Link do perfil: /?perfil=<apelido público>. O apelido é o mesmo id opaco do ranking (nunca o id do Google).

const ALIAS = /^[A-Za-z0-9_-]{16}$/;

/** Link para compartilhar o perfil. A origem vem do navegador. */
export function perfilUrl(origin: string, id: string): string {
  return `${origin}/?perfil=${encodeURIComponent(id)}`;
}

/** Apelido pedido na URL (`?perfil=`); null se não veio ou não tem o formato de um apelido. */
export function perfilDaUrl(search: string): string | null {
  const id = new URLSearchParams(search).get("perfil");
  return id !== null && ALIAS.test(id) ? id : null;
}
