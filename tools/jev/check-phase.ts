import { readFile } from "node:fs/promises";
import { JevClient } from "./core/client.ts";
import { choice, noul, score } from "./core/helpers.ts";

type PhaseEvidence = { phase:string; requirements:string[]; deterministicChecks:Record<string,"pass"|"fail"|"blocked"|"not_run">; changedFiles:string[]; notes?:string[] };
const path=process.argv[2];
if(!path) throw new Error("Usage: node tools/jev/check-phase.ts <phase-evidence.json>");
const evidence=JSON.parse(await readFile(path,"utf8")) as PhaseEvidence;
if(!evidence.phase||!Array.isArray(evidence.requirements)||!evidence.deterministicChecks) throw new Error("Evidence must include phase, requirements, and deterministicChecks");
const client=new JevClient();
const result=await client.systemOne(evidence,{
 status:choice("Classify implementation status using only the supplied requirements and evidence.",{complete:"Every requirement has passing evidence with no material regression",partial:"Useful implementation exists but requirements lack passing evidence",regressed:"Evidence shows previously working behavior was broken",blocked:"Completion depends on unavailable credentials, infrastructure, permissions, or external state",needs_human_review:"Evidence is contradictory or insufficient"}),
 coverage:score("How completely does the evidence cover the phase requirements?",["Little or no coverage","Some coverage with material gaps","Most requirements covered with limited gaps","All requirements have direct passing evidence"]),
 safe_to_advance:noul("Is it safe to advance without hiding a missing requirement or regression?",{true:"Checks pass and limitations are explicitly deferred",false:"A failure, hidden gap, or regression requires work or review"})
},{signal:AbortSignal.timeout(30000)});
const status=result.answers.status,advance=result.answers.safe_to_advance;
if(status.type!=="choice"||advance.type!=="noul") throw new Error("Unexpected Jev answer contract");
const decision=status.confidence<.7||(advance.noul>.35&&advance.noul<.75)?"needs_human_review":status.choice;
console.log(JSON.stringify({phase:evidence.phase,decision,selectedStatus:status.choice,confidence:status.confidence,safeToAdvanceProbability:advance.noul,provider:result.meta.provider,model:result.meta.resolvedModel,elapsedMs:result.meta.elapsedMs,attempts:result.meta.attempts,cost:result.meta.cost,usage:result.usage},null,2));
