export type SandboxOperation='create'|'edit'|'read'|'export'|'cleanup'|'upload'|'generate';
export type FixtureType='png'|'jpeg'|'webp'|'wav'|'pdf'|'docx';
export interface SyntheticScope {origin:string;account:string;route:string;objectId:string;objectName:string;runId:string}
export interface SignedGrant extends SyntheticScope {
  version:1;id:string;operations:SandboxOperation[];expiresAt:string;maxActions:number;maxBytes:number;cleanupPlan:string;
  spending:{maxTokens:number;maxOperations:number};tool?:'qa-tone';artifactId?:'wav'|'png';
}
export interface GrantEnvelope {grant:SignedGrant;signature:string}
export interface PrivateArtifact {id:string;type:FixtureType;mime:string;bytes:number;sha256:string;validation:'STRUCTURAL_ONLY';metadata:{width?:number;height?:number;durationSeconds?:number;sampleRate?:number;channels?:number}}
export interface PublicArtifact {type:FixtureType|'unknown';structurallyValid:boolean;dimensionsPresent:boolean;durationPresent:boolean;evidence:'LOCAL_ONLY'}
