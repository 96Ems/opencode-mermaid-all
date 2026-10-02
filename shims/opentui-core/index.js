// Re-export the OpenCode host's OpenTUI core so external plugin renderables
// share the host's class identities. Without this, OpenTUI throws
// "remove expects a renderable child object" when tearing down plugin renderables.
export * from "opentui:runtime-module:%40opentui%2Fcore";
