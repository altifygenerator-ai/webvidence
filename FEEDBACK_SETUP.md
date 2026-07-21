# Webvidence feedback form setup

The page is available at:

```text
https://www.webvidence.app/feedback
```

## 1. Run the Supabase migration

Run this file once in the live Supabase SQL editor:

```text
supabase/006_feedback_submissions.sql
```

It creates a private `feedback_submissions` table. Browser roles cannot read or write the table directly; submissions go through the server route.

## 2. Add the Vercel environment variables

```text
RESEND_API_KEY=re_...
FEEDBACK_TO_EMAIL=jlccustoms@gmail.com
FEEDBACK_FROM_EMAIL=Webvidence Feedback <feedback@webvidence.app>
```

`FEEDBACK_TO_EMAIL` falls back to `ADMIN_EMAIL` if it is omitted.

The domain used by `FEEDBACK_FROM_EMAIL` must be approved by the configured email provider. After adding or changing Vercel variables, redeploy the production site.

## 3. Test it

1. Open `/feedback` while signed in and confirm the account email is prefilled.
2. Submit one private response.
3. Confirm a row appears in `feedback_submissions`.
4. Confirm the notification email arrives and Reply goes to the user who submitted it.
5. Verify a private response stores every marketing-use flag as `false`.
6. Submit a response with public permission and confirm the exact permission choices are included in the email.

If email delivery is not configured or fails, the response is still saved and the row records the notification error.
