# ChatGPT control

The bridge does not call any AI API and does not need ChatGPT Work. ChatGPT must have an enabled tool that can **create GitHub issues** in the private queue. The local Windows computer must be awake and the bridge running. A text-only conversation cannot reach a local browser on its own.

## With GitHub issue-write tools

Give the chat this instruction:

```text
Use the GitHub issue queue Bequcho/beqson-qa-platform to control my local aiKit QA Bridge.
Create a new issue for each requested command. The title is AIKIT-QA: COMMAND.
The body starts with AIKIT_QA_BRIDGE_V2, then a newline, then a JSON object:
{"version":2,"command":"COMMAND","params":{}}
Read the issue comments for the result. A claim comment is not completion.
Never include credentials, cookies, arbitrary code, URLs, filenames or mutation approval.
Never infer an official checklist PASS from a smoke test.
After REVIEW_REQUIRED, review the local evidence with me and wait for my confirmation before resuming affected workflows.
```

Example issue title: `AIKIT-QA: RUN_SCENARIO`

```text
AIKIT_QA_BRIDGE_V2
{"version":2,"command":"RUN_SCENARIO","params":{"scenarioId":"public.home","locale":"en"}}
```

## With GPT Actions

If the current chat's GitHub integration cannot create issues, import `chatgpt-actions.openapi.json` into a private custom GPT's Actions configuration. Configure **API Key / Bearer** authentication in the Actions credential UI using a fine-grained GitHub token limited to the private queue repository, with Issues read/write and Metadata read. Do not put the token in chat, instructions, the schema, or this repository. Existing GitHub connection credentials cannot be copied automatically into a custom Action.

Use the instruction above. Test `queueQaTask` with PROGRESS, then `readQaResult` with the returned issue number. This configuration step needs the user's ChatGPT account; it has not been validated by the local bridge test. Account/plan/workspace availability of GPT Actions or write-capable plugins must be checked in that account. No OpenAI API key or external browser credits are used by the bridge.

References: [GPT Actions setup](https://developers.openai.com/api/docs/actions/getting-started), [GitHub plugin capabilities and availability](https://openai.com/business/plugins/github/). Integrations differ by surface; do not assume a read-only GitHub connector has issue-write tools.

## Commands

| Request | Command | Parameters |
|---|---|---|
| All safe public checks, 28 locales | SAFE_CHECKS | {}, or resumeRunId for only untested cases from a prior SAFE_CHECKS run |
| Remaining five locales, including approved preference checks | PUBLIC_REMAINING | {} |
| All 28 locales, including approved preference checks | PUBLIC_ALL | {} |
| Saved session access | AUTH_SMOKE | {} |
| Specific smoke or official criterion | RUN_SCENARIO | scenarioId, optional locale |
| Next eligible criterion in a category | TEST_TOOL | category |
| Next unattempted pending official item | RUN_NEXT or RESUME_CHECKLIST | {} |
| Retest a locally registered finding | RETEST | bugId, scenarioId |
| Current/historical/live-checkbox metrics | PROGRESS | {} |
| Most recent test run reference and counts | LATEST | {} |
| Known limitations per official item | BLOCKED | {} |
| Pause active task and pending tests | PAUSE | {} |
| Resume after review | RESUME | reviewIssue or reviewRunId matching the failure hold |
| Stop browser tree and bridge | STOP | {} |

Registered smoke IDs: `public.home`, `public.navigation`, `public.mobile`, `public.locale`, `auth.projects`.

Official IDs: `official.<category-slug>.<two-digit-item>`, e.g. `official.audio-kit.01`. Full official workflows are manual assisted until deterministic drivers and narrowly scoped object/cost permissions exist. The command returns a specific BLOCKED reason; it never guesses a PASS. A new task is needed for a retry. Reopening or editing an old task never replays it.

PAUSE/STOP are polled about every five seconds during a browser run, subject to GitHub response latency. Ctrl+C is the immediate local stop. Browser runs have hard time limits. Result publication can take another queue cycle after a network interruption.

COMPLETED means the **queue command** finished. Inspect `counts`, `outcome`, `suspected`, `confirmed`, and `officialItemsAutoCompleted` to determine QA coverage. Closed issues can contain BLOCKED, INCOMPLETE, REVIEW_REQUIRED or REJECTED results. Official item statuses use PASS, FAIL, BLOCKED and NOT TESTED separately.
