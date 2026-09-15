# 4-Stage Verification & Review Rules

1. **Stage 1: Deterministic Grounding & Verification**
   * Run the code in the terminal, verify real outputs, and confirm zero errors.
   * Verify against the Anti-Hallucination Checklist (no phantom imports, zero unverified assumptions).

2. **Stage 2: Primary Google Ecosystem Review (Gemini Pro Latest)**
   * Generate a dedicated, copy-ready prompt containing the exact code diff, context, and review questions for **Gemini Pro Latest** (via Google AI Studio or Gemini Advanced).
   * **Pause completely:** Stop all commands and code writing, and wait for the user.
   * User runs the audit in Gemini Pro Latest and pastes the response back here.
   * We evaluate the critique together, implement required fixes, and re-test deterministically.

3. **Stage 3: Secondary Google Ecosystem Double-Audit (Different Gemini Model)**
   * Format a second verification prompt specifically for an **independent Gemini model** in Google AI Studio (e.g., **Gemini 3.6 Flash** or **Gemini 3.5 Flash**) to double-audit the revised code.
   * **Pause completely** and wait for the user to run the second audit and paste its response.
   * Verify that both models agree and confirm the solution is 100% production-hardened.

4. **Stage 4: Interactive Human Final Approval (User Sign-Off)**
   * High-level common sense verification and interactive browser inspection by the user (zero coding required).
   * Only after the user's explicit approval is the microtask marked as **Finished** in `progress.md`.

5. **Mandatory Rule: Self-Contained Prompts with Embedded Source Code:**
   * Google AI Studio and Gemini Advanced do **NOT** have access to your local filesystem.
   * Every Stage 2 and Stage 3 prompt **MUST embed the full relevant source code / exact code diffs directly inside markdown code blocks**.
   * Never merely list filenames or provide high-level abstractions—Gemini must be able to audit the physical, line-by-line implementation directly from the prompt.

6. **Re-Review Rule (Zero Hesitation):**
   * If any task involves substantial changes, complex refactoring, or critical architectural additions, proactively trigger a re-review rather than making assumptions. Thoroughness and correctness always take priority over speed.