"use client";

/**
 * A field for a secret that is not a credential.
 *
 * Browsers and password managers treat every masked field as a login and try to
 * help: Chrome offers to generate one and file it under this site, and the
 * managers offer to fill it. That help is actively wrong here. An envelope
 * password is not an account password. It is a shared secret that has to reach
 * one other person, and a password saved into the funder's own vault reaches
 * nobody: the recipient cannot read it, and the funder has quietly stored the
 * one thing that was supposed to travel separately from the link.
 *
 * `autocomplete="new-password"` is the specific thing that summons Chrome's
 * generator, so it is gone. The rest are the opt-outs the major managers
 * respect, and the field is named for what it is rather than "password", since
 * the name is one of the heuristics.
 *
 * The masking still comes from `type="password"`, because it is the only way
 * that works everywhere, and a secret readable over a shoulder is its own
 * problem.
 */
export function SecretInput({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <input
      type="password"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
      // Chrome, Safari, Firefox.
      autoComplete="off"
      name="envelope-secret"
      // 1Password, LastPass, Bitwarden, Dashlane.
      data-1p-ignore=""
      data-lpignore="true"
      data-bwignore=""
      data-form-type="other"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      className={`w-full border border-[var(--ink-line)] bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-[var(--paper-faint)] focus:border-[var(--frank)] ${className}`}
    />
  );
}
