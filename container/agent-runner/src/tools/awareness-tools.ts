import { registry } from '../tool-registry.js';
import { writeCallbackAsync } from '../index.js';

async function callHost(tool: string, args: any, timeoutMs = 10000): Promise<any> {
    try {
        return await writeCallbackAsync(tool, args, timeoutMs);
    } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
    }
}

// Situational-awareness tools (Awareness, the background awareness agent). Mirrors
// security-tools.ts. awareness_log records/queries Awareness's sqlite history;
// tell_awareness lets the orchestrator pass a fact to Awareness (recorded as context).

registry.register({
    name: 'awareness_log',
    description:
        "Record or query Awareness's situational-awareness log (a persistent sqlite store of every " +
        "AWARENESS event and your verdicts, by time). ACTION 'record': append a row {ts, event, " +
        "label, is_known, person_count, seconds_empty, seconds_occupied, motion_area, assessment " +
        "('spoken'|'silent'|'note'|'flagged'), spoken (the line you said, if any), data (extra json)}. " +
        "ACTION 'query': return rows, newest-first, up to limit, filter by event/assessment/since/until " +
        "(YYYY-MM-DDTHH:MM:SS). ACTION 'stats': counts by event. Use this to de-dup (check whether you " +
        "greeted recently) and to look back by time/date.",
    schema: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['record', 'query', 'stats'], description: "'record' to append, 'query' to read, 'stats' for counts." },
            ts: { type: 'string', description: "record: local time (YYYY-MM-DDTHH:MM:SS)." },
            event: { type: 'string', description: "record: the event type (arrival|departure|unknown|covered|note)." },
            label: { type: 'string', description: "record: the known-person label, if recognized." },
            is_known: { type: 'boolean', description: "record: whether the person is a known person." },
            person_count: { type: 'number', description: "record: number of people." },
            seconds_empty: { type: 'number', description: "record: how long the room was empty." },
            seconds_occupied: { type: 'number', description: "record: how long the room was occupied." },
            motion_area: { type: 'number', description: "record: motion area in pixels." },
            assessment: { type: 'string', enum: ['spoken', 'silent', 'note', 'flagged'], description: "record: your verdict." },
            spoken: { type: 'string', description: "record: the line you spoke via send_message, if any." },
            since: { type: 'string', description: "query: lower bound local time." },
            until: { type: 'string', description: "query: upper bound local time." },
            limit: { type: 'number', description: "query: max rows (default 50)." },
            data: { type: 'object', description: "record: extra json to store." },
        },
        required: ['action'],
    },
    handler: async (args, _context) => {
        const resp = await callHost('awareness_log', args || {});
        if (resp?.ok) {
            if ((args as any)?.action === 'query' || (args as any)?.action === 'stats') {
                return resp.summary || 'No matching rows.';
            }
            return 'Logged.';
        }
        return `awareness_log failed: ${resp?.error || 'unknown error'}`;
    },
    toolset: 'awareness',
    tier: 'public',
});

// Orchestrator → Awareness direct. Mirrors tell_heimdall (security-tools.ts).
// tier:'public' + toolset 'chat' keeps it orchestrator-only (sub-agents don't
// include 'chat'). The user tells Jarvis a fact that should affect greeting
// behavior; Awareness records it silently, no chat reply.
registry.register({
    name: 'tell_awareness',
    description:
        "Send a message directly to Awareness, the background situational-awareness agent. Use this when " +
        "the user wants to tell Jarvis something about their presence/schedule that should affect " +
        "greeting behavior (e.g. 'heading out for the evening', 'I'm back, no need to greet me', " +
        "'my partner is staying over') so Awareness records it and factors it into future greetings. Do NOT " +
        "use the security agent for awareness notes — use this. Awareness records the message silently; it " +
        "will not reply in the chat. Returns confirmation.",
    schema: {
        type: 'object',
        properties: {
            message: { type: 'string', description: 'The message to pass to Awareness.' },
        },
        required: ['message'],
    },
    handler: async (args, _context) => {
        const resp = await callHost('tell_awareness', { message: String(args?.message || '') });
        if (resp?.ok) return `Told Awareness: ${String(args?.message || '').slice(0, 120)}. It will record this for future greetings.`;
        return `Could not reach Awareness: ${resp?.error || 'unknown error'}`;
    },
    toolset: 'chat',
    tier: 'public',
});
