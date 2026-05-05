# save_message VAPI Tool Spec

Add this tool to BOTH Sharpline and Cascade assistants. Closes the missing-tool gap.

> **Why this matters:** WF1's router has the route for `save_message` ready,
> but neither assistant has the tool that fires it. So callers who just want
> to leave a message ("tell Marcus to call me back") have nowhere for the
> AI to put that — it has to use save_estimate as a workaround, which is
> wrong semantically.

## Steps to add (do this for each assistant — Sharpline first, then Cascade)

### 1. In VAPI dashboard, go to the assistant

### 2. Click "Tools" → "Add Tool" → "Function"

### 3. Configure:

**Function Name:** `save_message` (or `Sharpline_save_message`, `Cascade_save_message` to match your naming)

**Description:**
```
Save a message from a caller who just wants to leave a message for the team —
not requesting an estimate or booking. Use when the caller says something like
"tell [owner] to call me back" or "just wanted to let them know X". The team
will follow up via SMS or callback.
```

**Parameters (JSON Schema):**
```json
{
  "type": "object",
  "required": ["tool_type", "name", "phone", "notes"],
  "properties": {
    "tool_type": {
      "type": "string",
      "const": "save_message",
      "description": "Always pass 'save_message'"
    },
    "name": {
      "type": "string",
      "description": "Caller's full name"
    },
    "phone": {
      "type": "string",
      "default": "",
      "description": "Pass an empty string. The system fills in the caller's actual phone from call metadata."
    },
    "notes": {
      "type": "string",
      "description": "The actual message content. What does the caller want the team to know?"
    },
    "sms_consent": {
      "type": "string",
      "default": "no",
      "description": "Did the caller agree to receive SMS replies? 'yes' or 'no'."
    }
  }
}
```

**Server URL:**
```
https://dtheriault.app.n8n.cloud/webhook/your-vapi-webhook-id
```
(Same as all other Field tools — this is WF1's main inbound webhook.)

**Headers:**

For **Sharpline_save_message**:
```
X-Webhook-Secret: sharpline_afb70c851f674c16aed41de424ec930dd148784f835f07ed
```

For **Cascade_save_message**:
```
X-Webhook-Secret: 2973b37f436bdc85e28d003fd66a177d56a028ce5134f958
```

(For future tenants, use that tenant's `webhook_secret` from the Clients table.)

### 4. Save tool

### 5. **Attach to assistant**: in the assistant's Tools section, make sure
the new save_message tool is checked/enabled

### 6. Test

After both assistants have the tool, test by calling the Twilio number and
saying:
> "Hi, this is Jane. I just wanted to let Marcus know that the part he ordered
> last week came in. He doesn't need to call me back, just wanted to let him know."

Expected: AI says "Got it, I'll let him know" (or similar) and saves the
message via save_message tool. Verify in Supabase:

```sql
SELECT * FROM public.messages
WHERE client_id = <tenant_id>
ORDER BY created_at DESC LIMIT 3;
```

You should see the message saved with caller_name, caller_phone (E.164), and
message_body.

> **Note:** The `messages` table needs to exist. If your Supabase doesn't have
> it yet, here's the schema (likely already created during earlier setup):
>
> ```sql
> CREATE TABLE IF NOT EXISTS public.messages (
>   id BIGSERIAL PRIMARY KEY,
>   client_id BIGINT NOT NULL REFERENCES public."Clients"(id),
>   caller_name TEXT,
>   caller_phone TEXT,
>   callback_phone TEXT,
>   message_body TEXT NOT NULL,
>   status TEXT DEFAULT 'unread',
>   created_at TIMESTAMPTZ DEFAULT NOW()
> );
> ```
