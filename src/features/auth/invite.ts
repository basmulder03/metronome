/** The invitation token in a link like https://host/#invite=TOKEN, or null. */
export const inviteFromHash = (hash: string) => (hash.startsWith('#invite=') ? decodeURIComponent(hash.slice(8)) || null : null);

export const inviteLink = (token: string) => `${location.origin}${location.pathname}#invite=${encodeURIComponent(token)}`;
