import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * Utility to retry a promise-returning function with exponential backoff.
 * Specifically targets 429 (Too Many Requests) errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const errStr = String(err).toLowerCase() + JSON.stringify(err).toLowerCase();
      const isQuota = err?.status === 429 || err?.code === 429 || errStr.includes('429') || errStr.includes('quota');
      
      if (isQuota && i < maxRetries) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Gemini Quota hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

const APPRAISAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    player: { type: Type.STRING, description: "Name of the player, coin type, or currency denomination." },
    year: { type: Type.STRING, description: "Year of issue/mint." },
    brand: { type: Type.STRING, description: "Brand or Mint mark (e.g., Topps, Philadelphia Mint)." },
    set: { type: Type.STRING, description: "Set name or series name." },
    cardNumber: { type: Type.STRING, description: "Card number or reference number." },
    variant: { type: Type.STRING, description: "Parallel, variety, or specific edition." },
    itemType: { type: Type.STRING, description: "Trading Card, Coin, Paper Money, Postage Stamp, or Comic Book." },
    marketValue: { type: Type.NUMBER, description: "Current market value in USD based on recent eBay sales for the item in RAW (Ungraded) condition. Return a number ONLY." },
    marketValueRaw: { type: Type.NUMBER, description: "Current market value in USD based on recent eBay sales for the item in Raw (Ungraded) condition." },
    marketValuePSA9: { type: Type.NUMBER, description: "Current market value in USD based on recent eBay sales for the item in PSA 9 condition." },
    marketValuePSA10: { type: Type.NUMBER, description: "Current market value in USD based on recent eBay sales for the item in PSA 10 condition." },
    isCurrency: { type: Type.BOOLEAN },
    isCoin: { type: Type.BOOLEAN },
    isStamp: { type: Type.BOOLEAN },
    isComic: { type: Type.BOOLEAN },
    estimatedGrade: { type: Type.STRING, description: "Grade based on industrial scales (PSA, NGC, etc.)" },
    gemMintProbability: { type: Type.NUMBER, description: "0.0 to 1.0 probability of being a GEM MINT / Perfect grade (e.g. 0.95)." },
    autographGrade: { type: Type.STRING, description: "Grade for the autograph (5-10) if present, otherwise null." },
    reasoning: { type: Type.STRING, description: "A very detailed explanation specifically stating why the asset will or will not achieve a Gem Mint 10 / Perfect grade, based on surface, edge, corner, and centering observations." },
    gradingRecommendation: { type: Type.STRING, description: "Professional advice on whether to submit for grading." },
    subgrades: {
      type: Type.OBJECT,
      properties: {
        centering: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.STRING },
            explanation: { type: Type.STRING }
          }
        },
        corners: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.STRING },
            explanation: { type: Type.STRING }
          }
        },
        edges: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.STRING },
            explanation: { type: Type.STRING }
          }
        },
        surface: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.STRING },
            explanation: { type: Type.STRING }
          }
        }
      }
    },
    suggestedParallels: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["player", "year", "itemType", "estimatedGrade", "gemMintProbability", "reasoning", "subgrades"]
};

export async function analyzeAsset(frontImageBase64: string, backImageBase64: string) {
  return withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          text: `Identify if the asset is a Trading Card (Sports/TCG), Coin, Paper Money, Postage Stamp, or Comic Book.

  - Use the built-in search grounding to find the most accurate current market price based on RECENT EBAY SALES (Sold listings) for the specific item (Year, Player, Item).
  - The primary 'marketValue' MUST represent the value in RAW (Ungraded) condition.
  - ALWAYS provide the following market values based on eBay sales history:
    1. Raw (Ungraded) price (Use the most recent single 'Sold' price from eBay).
    2. PSA 9 price.
    3. PSA 10 price.
  - If eBay sales data is not available for a specific item (e.g. some stamps or coins), use the most reliable market data available and note it in reasoning.
  
  FOR SPORTS AND TCG CARDS (BGS STRICT GRADING):
  - BLK LABEL (10): Perfect 10 with all four 10 subgrades. Flawless.
  - PRISTINE 10: At least three 10 subgrades and one 9.5. Virtually flawless.
  - GEM MT 9.5: Centering: 50/50 one way, 55/45 the other on front. 60/40 or better on back. Corners: Mint to naked eye, slight imperfections under magnification. Edges: Virtually Mint to naked eye, speck of wear allowed under intense scrutiny. Surface: A few extremely minor print spots detectable only under intense scrutiny. Deep color, perfect gloss.
  - MT 9: Centering: 55/45 both ways on front. 70/30 or better on back. Corners: Mint upon close inspection, speck of wear under intense scrutiny. Edges: Virtually Mint to naked eye, unobtrusive specks of chipping allowed. Surface: Handful of printing specks or one minor spot. Very minor focus/color imperfections. Clean gloss, 1-2 tiny scratches barely noticeable.
  - NM/MT 8: Centering: 60/40 both ways on front. 80/20 or better on back. Corners: Sharp to naked eye, slight imperfections under close exam. Edges: Relatively smooth borders, specks of chipping visible to naked eye allowed. Surface: A few minor print spots. Solid gloss with very minor scratches or subtle metallic line.
  - NM 7: Centering: 65/35 front, 90/10 back. Slight diamond cutting allowed. Corners: Very minor wear on 2-3 corners. Edges: Slight roughness, minor chipping or notching allowed. Surface: A few noticeable spots or minor speckling. Minor color/focus imperfections. Very minor wax stain on back. 
  - EX MT 6: Centering: 70/30 font, 95/5 back. Corners: Fuzzy but free of dings/fraying. Edges: Moderate roughness/chipping. Surface: Noticeable spots, minor border discoloration, minor wax/ink marks. Relativly solid gloss with minor scratches (no scuffing).
  - EX 5: Centering: 75/25 front, 95/5 back. Corners: Four fuzzy corners, touch of notching or minor ding allowed. Edges: Noticeable roughness, no layering. Surface: Noticeable spots, minor color/focus imperfections, minor wax/ink marks. Some gloss loss.
  - VG/EX 4: Centering: 80/20 front, 100/0 back. Corners: Slight notching/layering or moderate dings. Edges: Chipped/notched/layered. Surface: Heavy print spots, hairline creases. Moderate color/focus/wax/ink issues. Significant gloss loss.
  - VG 3: Centering: 85/15 front, 100/0 back. Corners: Slightly rounded or noticeably notched with slight layering. Edges: Heavy notching, moderate layering, heavy chipping. Surface: Heavy spots, very minor creases, negligible gloss, minor scuffing or very minor tear.
  - GOOD 2: Centering: 90/10 front, 100/0 back. Corners: Noticeably rounded or heavily notched with moderate layering. Edges: Severely chipped/notched/layered. Surface: Severe spots, noticeable creases, no gloss, noticeable scuffing or tear.
  - POOR 1: Centering: 100/0 front/back. Corners: Heavily rounded/notched, noticeable layering. Edges: Destructive chipping/notching/layering. Surface: Severe spots/stains, heavy creases, no original gloss, severe scuffing or tear.
  
  * Note: Use half-point increments where characteristics bridge two levels (e.g., 9.5, 8.5).
  * Use BGS labels: BLK LABEL, PRISTINE 10, GEM MT, MT, NM, EX MT, EX, VG, GOOD, POOR.
  
  AUTOGRAPH GRADING SCALE (5-10):
  - 10: Beautiful, boldly signed, perfect to naked eye.
  - 9: Very pleasing, slight imperfections (bubbling/micro scratching ok, no yellowing/fading/smearing).
  - 8: Flaws begin to stand out. Solid but might have bubbling or minor scuffing/scratching. Light fading/yellowing allowed.
  - 7: Heavy bubbling, noticeable scratching/yellowing/fading/smearing. Up to 20% hidden/missing.
  - 6: Highly distracting flaws. Bubbling making parts invisible. Significant smearing/fading. Up to 35% hidden/missing.
  - 5: Catastrophic flaws. Massive fading/smearing, over 50% removed/invisible.
  
  AUTHENTICITY: For TCG cards, ONLY check spelling, grammar, and punctuation. DO NOT check illustrator or set codes.

  FOR COINS (NGC SHELDON SCALE): 
  - STRIKE TYPES: MS (Mint State 60-70), PF (Proof), SP (Specimen).
  - DENOMINATION: Return as "player" field. Use common names: "Penny" (not One Cent), "Nickel" (not Five Cents), "Dime" (not Ten Cents), "Quarter", "Half Dollar", "Silver Dollar", etc.
  - MINT MARKS (for "brand" field):
    - 1965–1967: Strictly NO mint marks on circulating coins.
    - 1968–Present: P (Philadelphia), D (Denver), S (San Francisco), W (West Point). Found on obverse.
    - Pre-1965: D (Denver), S (San Francisco), or No Mark (Philadelphia).
    - 1942–1945 Silver Nickels: Feature large P, D, or S above Monticello.
    - Rare/Historical: CC (Carson City), O (New Orleans), D (Dahlonega), C (Charlotte).
    - NOTE: Circulating coins only have P, D, or S. Never use "B" or "R" as mint marks. Avoid confusing strike characters (RD, RB, BN) with mint marks.
  - NUMERIC GRADES (1-70):
    - 70: No imperfections at 5x magnification.
    - 69-67: Fully/Sharply struck, imperceptible to few imperfections.
    - 66-65: Well struck, minimal to moderate marks.
    - 64-60: Average to weak strike, obvious marks/abrasions.
    - AU 58-50: Slight wear on high points.
    - XF 45-40: Complete details, minor wear.
    - VF 35-20: Complete to moderate details, sharp letters.
    - F 15-12: Recessed softness, letters sharp.
    - VG 10-8: Wear throughout, soft letters.
    - G 6-4: Peripheral letters full, rims sharp to worn.
    - AG 3: Letters readable, rims worn into fields.
    - FR 2: Some details, rims barely visible.
    - PO 1: Identifiable date/type, rims flat.
  - DESIGNATIONS: Use (+) for high-end of grade or (*) for exceptional eye appeal.
  - STRIKE CHARACTERS: RD (Red), RB (Red Brown), BN (Brown), Ultra Cameo (PF deep contrast), Cameo (PF moderate contrast), DPL (Deep Prooflike), PL (Prooflike).
  
  FOR PAPER MONEY: 
  - Use PMG Scale (1-70). Display ONLY the numerical grade (e.g. "65" not "65 EPQ").
  - GRADING CRITERIA:
    - 70 Gem Unc / 70 EPQ: Highest grade. No handling at 5x. Qualifying Star designation.
    - 69 EPQ Superb Gem Unc: Nearly indistinguishable from 70; margins/registration slightly off; no handling to unaided eye.
    - 68 EPQ Superb Gem Unc: Margins/registration slightly off; minor handling.
    - 67 EPQ Superb Gem Unc: Above-average margins/registration; minor handling.
    - 66 EPQ Gem Unc: Slightly more handling than 67; centering above average.
    - 65 EPQ Gem Unc: One or two minor distractions; centering above average. (Notes 65+ MUST be EPQ).
    - 64 Choice Unc: Centering off on 1-2 sides; some handling; no folds.
    - 63 Choice Unc: Imperfect centering; design may be flat; no folds.
    - 62 Uncirculated: Minor-to-moderate handling/corner tips; no folds.
    - 61 Uncirculated: Poorly centered; counting marks/smudges; no folds.
    - 60 Uncirculated: Toned, small stain or fading; no folds through design.
    - 58 Choice AU: Often a single fold crossing the design.
    - 55 AU: One fold or 2-3 corner folds through design.
    - 53 AU: Two vertical folds or single horizontal fold.
    - 50 AU: Two heavier folds or light horizontal/vertical folds; significant handling.
    - 45 Choice EF: 2-3 heavy folds, one horizontal.
    - 40 EF: 3 or more folds, one horizontal.
    - 35 Choice VF: looks EF but 4-7 light folds.
    - 30 VF: Lightly circulated, light soiling, 7-10 folds.
    - 25 VF: Modest circulation, more folds/soiling than 30.
    - 20 VF: Moderately circulated, numerous folds, mild soiling.
    - 15 Choice Fine: Too many folds/circulation to be VF.
    - 12 Fine: Considerable circulation, rounded corners, margin splits, whole/solid paper.
    - 10 VG: Solid whole note, lots of circulation, limp, minor problems.
    - 8 VG: Heavily circulated, intact but small pieces missing, soiling/stains/splits common, limp.
    - 6 Good: Very worn, serious splits, fraying, damage.
    - 4 Good: Very heavily circulated, totally limp, pieces missing.
  - NAME/DESCRIPTION (player field): Return ONLY the denomination in words (e.g. "One Dollar" not "$1 Bill", "Five Dollars", "Ten Dollars", "Twenty Dollars", "Fifty Dollars", "One Hundred Dollars"). Do NOT include the Year or Mint Location/Brand here as they are separate fields.
  - BRAND: Use the city/location (e.g. "Philadelphia").
  FOR COMIC BOOKS (CGC SCALE): 
  - Return the full descriptive name and numerical grade (e.g., "Gem Mint 10.0" or "NM/M 9.8").
  - GRADING CRITERIA:
    - Gem Mint 10.0: Highest grade. No manufacturing or handling defects.
    - Mint 9.9: Nearly indistinguishable from 10.0; very minor manufacturing defect only.
    - NM/M 9.8: Nearly perfect; negligible handling or manufacturing defects.
    - NM+ 9.6: Well-preserved; several minor defects.
    - NM 9.4: Well-preserved; minor wear and small defects.
    - NM- 9.2: Well-preserved; some wear and small defects.
    - VF/NM 9.0: Good eye appeal; a number of minor defects.
    - VF+ 8.5: Attractive; moderate defect or number of small defects.
    - VF 8.0: Attractive; moderate defect or accumulation of small defects.
    - VF- 7.5: Above-average; moderate defect or accumulation of small defects.
    - FN/VF 7.0: Above-average; major defect or accumulation of small defects.
    - FN+ 6.5: Above-average; significant accumulation of small defects.
    - FN 6.0: Slightly above-average; major defect and small defects.
    - FN- 5.5: Slightly above-average; several moderate defects.
    - VG/FN 5.0: Average; several moderate defects.
    - VG+ 4.5: Slightly below-average; multiple moderate defects.
    - VG 4.0: Below-average; multiple moderate defects.
    - VG- 3.5: Below-average; several major defects or accumulation of moderate defects.
    - G/VG 3.0: Significant evidence of handling; moderate-to-major defects.
    - G+ 2.5: Extensive evidence of handling; multiple moderate-to-major defects.
    - G 2.0: Extensive evidence; numerous moderate-to-major defects.
    - G- 1.8: Numerous major defects.
    - Fa/G 1.5: Heavy accumulation of major defects.
    - Fa 1.0: Poorly handled; heavy accumulation of major defects.
    - Poor 0.5: Heavily defaced; missing pieces; major defects.
  FOR STAMPS (ASG GRADING):
  - Use ASG Scale (1-100). Return ONLY the numerical grade (e.g. "90").
  - GRADING CRITERIA:
    - Gem 100: Fully centered, no post-production imperfections at 5x magnification.
    - Superb 99: Visually indistinguishable from 100 but slightly off center. Very small imperfections allowed.
    - XF/Superb 95: Up to two misaligned margins, minor handling/spots/blemishes.
    - XF 90: Two obviously misaligned margins, light handling/fingerprints/yellowing.
    - VF/XF 88: Two obviously misaligned margins, small blemishes/inclusions/short perfs/yellowing.
    - VF/XF 85: Fully complete, bright design, slightly misaligned centering. Significant handling/blemishes.
    - VF 80: Obviously misaligned margins. Small imperfections (damages/folds/cleaning evidence).
    - F/VF 75: Basically complete design. Significant handling or folds. Light fading.
    - F 70: Perfs/margins come into edge of design. Obvious faults (folds/gum skips/pulled perfs).
    - VG/F 60: Perfs/margins into design. Obvious faults (folds/stains/faded color).
    - VG 50: Perfs/margins into design. Obvious faults (folds/stains/blurred design/small piece missing).
    - G/VG 40: Perfs/margins into design. Obvious faults (folds/stains/blurred design/small pieces missing).
    - G 30: Perfs/margins significantly into design. Extensive faults. Design difficult to recognize.
    - Fair/G 20: Perfs/margins significantly into design. Extensive faults. Design difficult to recognize.
    - Fair 10: Perfs/margins significantly into design. Extensive faults. Design nearly impossible to recognize.
  
  - NUMERIC GRADE MODIFIERS (Include in "variant" or "reasoning"):
    Used, Mint, Mint, Original Gum (at least 80% intact), Mint, Partial Original Gum (less than 80% intact), Mint, Original Paper (not issued with gum), Mint, No Original Gum, Cancelled, Cancelled, Original Gum, Cancelled, Original Paper.`
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: frontImageBase64.split(',')[1]
        }
      },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: backImageBase64.split(',')[1]
        }
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: APPRAISAL_SCHEMA as any,
    },
  });

  return JSON.parse(result.text || "{}");
  });
}

export async function reevaluateAssetValue(assetData: any) {
  return withRetry(async () => {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
      {
        text: `Research and provide current market values for the following asset based on RECENT EBAY SALES (Sold listings). 
        
        ASSET DETAILS:
        Year: ${assetData.year}
        Brand/Mint: ${assetData.brand}
        Player/Type: ${assetData.player}
        Set: ${assetData.set}
        Card Number: ${assetData.cardNumber}
        Variation/Parallel: ${assetData.variant}
        Item Type: ${assetData.itemType}

        CRITICAL INSTRUCTION FOR PARALLELS:
        You must match the 'Variation/Parallel' EXACTLY. If the variation is "Cracked Ice", do NOT pull prices for "Orange Cracked Ice", "Red Cracked Ice", "Blue Cracked Ice", or any other color unless it is explicitly specified. Only pull data for the base "Cracked Ice" version. 

        Please provide:
        1. Market value for RAW (Ungraded) condition (Use the most recent single 'Sold' price from eBay).
        2. Market value for PSA 9 condition.
        3. Market value for PSA 10 condition.
        
        Return the values in the specified JSON schema.`
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          marketValueRaw: { type: Type.NUMBER },
          marketValuePSA9: { type: Type.NUMBER },
          marketValuePSA10: { type: Type.NUMBER },
          marketValue: { type: Type.NUMBER, description: "Set this to the Raw value." }
        },
        required: ["marketValueRaw", "marketValuePSA9", "marketValuePSA10", "marketValue"]
      } as any,
    },
  });

  return JSON.parse(result.text || "{}");
  });
}
