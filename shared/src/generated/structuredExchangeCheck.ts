/**
 * GENERATED from shared/schemas/structured-exchange-1.json — do not edit.
 *
 * Regenerate with:
 *   node --import tsx/esm shared/scripts/generate-structured-exchange-check.mjs
 *
 * A boolean check of the published schema, small enough to ship to the browser.
 * Diagnostics live in the Node-side validator; see structuredExchangeSchemaNode.ts.
 */
/* eslint-disable */
// @ts-nocheck
import { Hashing } from "typebox/system"
import { Format } from "typebox/format"
import { Guard } from "typebox/guard"

// @ts-ignore
let External = []

// @ts-ignore
export function SetExternal(external) { External = external.variables }

// @ts-ignore
const check_0 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && (((("schema" in value && "kind" in value) && "data" in value) && Object.getOwnPropertyNames(value).every((var_0, var_1) => (External[0].test(var_0) || false))) && ((((value.schema === "urn:structured-exchange:1" && ((value.kind === "graph" || value.kind === "sequence") || value.kind === "table")) && (value.target === undefined || (!("target" in value) || check_1(value.target)))) && (value.removals === undefined || (!("removals" in value) || (Array.isArray(value.removals) && (value.removals.every((element, index) => check_2(element)) && value.removals.length <= 500))))) && [((typeof value.data === "object" && value.data !== null && !(Array.isArray(value.data))) && ((("nodes" in value.data && "edges" in value.data) && Object.getOwnPropertyNames(value.data).every((var_5, var_6) => (External[2].test(var_5) || false))) && (((Array.isArray(value.data.nodes) && ((value.data.nodes.every((element, index) => check_6(element)) && value.data.nodes.length <= 500) && value.data.nodes.length >= 1)) && (Array.isArray(value.data.edges) && (value.data.edges.every((element, index) => check_8(element)) && value.data.edges.length <= 2000))) && (value.data.containers === undefined || (!("containers" in value.data) || (Array.isArray(value.data.containers) && (value.data.containers.every((element, index) => check_10(element)) && value.data.containers.length <= 50))))))), ((typeof value.data === "object" && value.data !== null && !(Array.isArray(value.data))) && ((("participants" in value.data && "messages" in value.data) && Object.getOwnPropertyNames(value.data).every((var_17, var_18) => (External[8].test(var_17) || false))) && (((Array.isArray(value.data.participants) && ((value.data.participants.every((element, index) => check_6(element)) && value.data.participants.length <= 100) && value.data.participants.length >= 1)) && (Array.isArray(value.data.messages) && (value.data.messages.every((element, index) => check_11(element)) && value.data.messages.length <= 1000))) && (value.data.containers === undefined || (!("containers" in value.data) || (Array.isArray(value.data.containers) && (value.data.containers.every((element, index) => check_10(element)) && value.data.containers.length <= 50))))))), ((typeof value.data === "object" && value.data !== null && !(Array.isArray(value.data))) && ((("columns" in value.data && "rows" in value.data) && Object.getOwnPropertyNames(value.data).length === 2) && ((Array.isArray(value.data.columns) && ((value.data.columns.every((element, index) => (typeof element === "string" && (Guard.IsMaxLength(element, 200) && Guard.IsMinLength(element, 1)))) && value.data.columns.length <= 50) && value.data.columns.length >= 1)) && (Array.isArray(value.data.rows) && (value.data.rows.every((element, index) => [check_13(element), ((typeof element === "object" && element !== null && !(Array.isArray(element))) && (("cells" in element && Object.getOwnPropertyNames(element).every((var_24, var_25) => (External[11].test(var_24) || false))) && (check_13(element.cells) && (element.role === undefined || (!("role" in element) || (((element.role === "added" || element.role === "changed") || element.role === "context") || element.role === "removed"))))))].reduce((result, var_23, _) => (var_23 === true) ? ++result : result, 0) === 1) && value.data.rows.length <= 5000)))))].reduce((result, var_4, _) => (var_4 === true) ? ++result : result, 0) === 1))));

// @ts-ignore
const check_1 = ((value) => (typeof value === "string" && (Guard.IsMaxLength(value, 200) && Guard.IsMinLength(value, 1))));

// @ts-ignore
const check_2 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((("type" in value && "ref" in value) && Object.getOwnPropertyNames(value).every((var_2, var_3) => (External[1].test(var_2) || false))) && ((((((value.type === "element" || value.type === "relationship") && check_1(value.ref)) && (value.label === undefined || (!("label" in value) || check_3(value.label)))) && (value.kind === undefined || (!("kind" in value) || check_4(value.kind)))) && (value.from === undefined || (!("from" in value) || check_5(value.from)))) && (value.to === undefined || (!("to" in value) || check_5(value.to)))))));

// @ts-ignore
const check_3 = ((value) => (typeof value === "string" && Guard.IsMaxLength(value, 500)));

// @ts-ignore
const check_4 = ((value) => (typeof value === "string" && (Guard.IsMaxLength(value, 100) && Guard.IsMinLength(value, 1))));

// @ts-ignore
const check_5 = ((value) => (typeof value === "string" && (Guard.IsMaxLength(value, 200) && Guard.IsMinLength(value, 1))));

// @ts-ignore
const check_6 = ((value) => (((typeof value === "object" && value !== null && !(Array.isArray(value))) && (("id" in value && Object.getOwnPropertyNames(value).every((var_7, var_8) => (External[3].test(var_7) || false))) && (((((check_5(value.id) && (value.ref === undefined || (!("ref" in value) || check_1(value.ref)))) && (value.label === undefined || (!("label" in value) || check_3(value.label)))) && (value.kind === undefined || (!("kind" in value) || check_4(value.kind)))) && (value.set === undefined || (!("set" in value) || check_7(value.set)))) && (value.container === undefined || (!("container" in value) || check_5(value.container)))))) && (!((!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "ref" in value)) ? (!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "label" in value) : true)));

// @ts-ignore
const check_7 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((Object.getOwnPropertyNames(value).every((var_9, var_10) => (External[4].test(var_9) || false)) && (((value.label === undefined || (!("label" in value) || check_3(value.label))) && (value.kind === undefined || (!("kind" in value) || check_4(value.kind)))) && (value.container === undefined || (!("container" in value) || check_5(value.container))))) && Object.getOwnPropertyNames(value).length >= 1)));

// @ts-ignore
const check_8 = ((value) => (((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((("from" in value && "to" in value) && Object.getOwnPropertyNames(value).every((var_11, var_12) => (External[5].test(var_11) || false))) && (((((check_5(value.from) && check_5(value.to)) && (value.kind === undefined || (!("kind" in value) || check_4(value.kind)))) && (value.ref === undefined || (!("ref" in value) || check_1(value.ref)))) && (value.label === undefined || (!("label" in value) || check_3(value.label)))) && (value.set === undefined || (!("set" in value) || check_9(value.set)))))) && (!((!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "ref" in value)) ? (!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "kind" in value) : true)));

// @ts-ignore
const check_9 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((Object.getOwnPropertyNames(value).every((var_13, var_14) => (External[6].test(var_13) || false)) && ((value.kind === undefined || (!("kind" in value) || check_4(value.kind))) && (value.label === undefined || (!("label" in value) || check_3(value.label))))) && Object.getOwnPropertyNames(value).length >= 1)));

// @ts-ignore
const check_10 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((("id" in value && "label" in value) && Object.getOwnPropertyNames(value).every((var_15, var_16) => (External[7].test(var_15) || false))) && ((check_5(value.id) && check_3(value.label)) && (value.kind === undefined || (!("kind" in value) || check_4(value.kind)))))));

// @ts-ignore
const check_11 = ((value) => (((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((("from" in value && "to" in value) && Object.getOwnPropertyNames(value).every((var_19, var_20) => (External[9].test(var_19) || false))) && ((((check_5(value.from) && check_5(value.to)) && (value.ref === undefined || (!("ref" in value) || check_1(value.ref)))) && (value.label === undefined || (!("label" in value) || check_3(value.label)))) && (value.set === undefined || (!("set" in value) || check_12(value.set)))))) && (!((!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "ref" in value)) ? (!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "label" in value) : true)));

// @ts-ignore
const check_12 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((Object.getOwnPropertyNames(value).every((var_21, var_22) => (External[10].test(var_21) || false)) && (value.label === undefined || (!("label" in value) || check_3(value.label)))) && Object.getOwnPropertyNames(value).length >= 1)));

// @ts-ignore
const check_13 = ((value) => (Array.isArray(value) && (value.every((element, index) => ((((typeof element === "string" || Number.isFinite(element)) || typeof element === "boolean") || element === null) && (!(typeof element === "string") || Guard.IsMaxLength(element, 1000)))) && value.length <= 50)));

// @ts-ignore
export function Check(value) { return check_0(value) }

SetExternal({ variables: [
  new RegExp("(^schema$|^kind$|^target$|^removals$|^data$)", "u"),
  new RegExp("(^type$|^ref$|^label$|^kind$|^from$|^to$)", "u"),
  new RegExp("(^nodes$|^edges$|^containers$)", "u"),
  new RegExp("(^id$|^ref$|^label$|^kind$|^set$|^container$)", "u"),
  new RegExp("(^label$|^kind$|^container$)", "u"),
  new RegExp("(^from$|^to$|^kind$|^ref$|^label$|^set$)", "u"),
  new RegExp("(^kind$|^label$)", "u"),
  new RegExp("(^id$|^label$|^kind$)", "u"),
  new RegExp("(^participants$|^messages$|^containers$)", "u"),
  new RegExp("(^from$|^to$|^ref$|^label$|^set$)", "u"),
  new RegExp("(^label$)", "u"),
  new RegExp("(^cells$|^role$)", "u"),
] })
