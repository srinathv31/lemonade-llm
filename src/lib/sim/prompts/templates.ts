import { DECISION_CONSTRAINTS } from "../decisions";

/**
 * System instruction for JSON-only output.
 * Compatible with gemma3, llama3, mistral models.
 */
export const JSON_SYSTEM_INSTRUCTION =
  "You are an AI running a lemonade stand business. You must respond with ONLY a valid JSON object, no additional text.";

/**
 * Schema description for the expected output format.
 * Uses constraints from DECISION_CONSTRAINTS for accuracy.
 */
export const OUTPUT_SCHEMA_DESCRIPTION = `{
  "price": <number between ${DECISION_CONSTRAINTS.price.min} and ${DECISION_CONSTRAINTS.price.max}, dollars per cup>,
  "quality": <integer between ${DECISION_CONSTRAINTS.quality.min} and ${DECISION_CONSTRAINTS.quality.max}, quality level>,
  "marketing": <integer between ${DECISION_CONSTRAINTS.marketing.min} and ${DECISION_CONSTRAINTS.marketing.max}, marketing effort>,
  "reasoning": "<brief 1-2 sentence explanation, max ${DECISION_CONSTRAINTS.reasoning.maxChars} characters>"
}`;

/**
 * Role description for the agent.
 */
export const ROLE_DESCRIPTION =
  "You are managing a lemonade stand in a competitive market simulation. Your goal is to maximize profit by setting the right price, quality, and marketing levels for each hour.";

/**
 * Key factors to consider when making decisions.
 */
export const FACTORS_TO_CONSIDER = `Consider these factors:
- Weather affects customer demand (sunny/hot = more demand, rainy/cold = less)
- Higher quality costs more but attracts customers
- Marketing increases visibility but costs money
- Competitor prices affect your relative attractiveness
- Time of day matters (lunch hours may have higher traffic)`;

/**
 * Final instruction for JSON output.
 */
export const FINAL_INSTRUCTION =
  "Respond with ONLY a valid JSON object matching the schema above. Do not include any other text, explanation, or markdown formatting.";
