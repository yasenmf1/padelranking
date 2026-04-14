# Padel Ranking — Email Templates

Имейл шаблоните се настройват ръчно в Supabase Dashboard.
HTML файловете са в `supabase/email_templates/`.

---

## Как да приложиш шаблоните

1. Отиди в [Supabase Dashboard](https://supabase.com/dashboard/project/vrfgpgwtmvmckcveepgp)
2. **Authentication → Email Templates**
3. За всеки шаблон: смени Subject + HTML → Save

---

## 1. Reset Password

**Subject:**
```
🎾 Смяна на парола - Padel Ranking
```

**HTML:** Копирай съдържанието от `supabase/email_templates/reset_password.html`

> Суpabase placeholder за линка: `{{ .ConfirmationURL }}`

---

## 2. Confirm Signup

**Subject:**
```
🎾 Добре дошъл в Padel Ranking!
```

**HTML:** Копирай съдържанието от `supabase/email_templates/confirm_signup.html`

> Supabase placeholder за линка: `{{ .ConfirmationURL }}`

---

## URL настройки (Authentication → URL Configuration)

| Поле | Стойност |
|------|----------|
| Site URL | `https://padelranking.info` |
| Redirect URLs | `https://padelranking.info/**` |

---

## SPF запис за Resend (DNS)

```
v=spf1 include:amazonses.com ~all
```

Добавя се като TXT запис на домейна в DNS конфигурацията.
