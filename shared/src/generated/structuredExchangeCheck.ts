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
const check_2bc5822166bf4786 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && (((("schema" in value && "kind" in value) && "data" in value) && Object.getOwnPropertyNames(value).every((var_0, var_1) => (External[0].test(var_0) || false))) && ((((value.schema === "urn:structured-exchange:1" && ((value.kind === "graph" || value.kind === "sequence") || value.kind === "table")) && (value.target === undefined || (!("target" in value) || check_2e887d21691806b7(value.target)))) && (value.removals === undefined || (!("removals" in value) || (Array.isArray(value.removals) && (value.removals.every((element, index) => check_2bc5422166bedac6(element)) && value.removals.length <= 500))))) && [((typeof value.data === "object" && value.data !== null && !(Array.isArray(value.data))) && ((("nodes" in value.data && "edges" in value.data) && Object.getOwnPropertyNames(value.data).length === 2) && ((Array.isArray(value.data.nodes) && ((value.data.nodes.every((element, index) => check_2be0722166d5f40e(element)) && value.data.nodes.length <= 500) && value.data.nodes.length >= 1)) && (Array.isArray(value.data.edges) && (value.data.edges.every((element, index) => check_2c320221671b3fe6(element)) && value.data.edges.length <= 2000))))), ((typeof value.data === "object" && value.data !== null && !(Array.isArray(value.data))) && ((("participants" in value.data && "messages" in value.data) && Object.getOwnPropertyNames(value.data).length === 2) && ((Array.isArray(value.data.participants) && ((value.data.participants.every((element, index) => check_2be0722166d5f40e(element)) && value.data.participants.length <= 100) && value.data.participants.length >= 1)) && (Array.isArray(value.data.messages) && (value.data.messages.every((element, index) => check_2c246a21670fb342(element)) && value.data.messages.length <= 1000))))), ((typeof value.data === "object" && value.data !== null && !(Array.isArray(value.data))) && ((("columns" in value.data && "rows" in value.data) && Object.getOwnPropertyNames(value.data).length === 2) && ((Array.isArray(value.data.columns) && ((value.data.columns.every((element, index) => (typeof element === "string" && (Guard.IsMaxLength(element, 200) && Guard.IsMinLength(element, 1)))) && value.data.columns.length <= 50) && value.data.columns.length >= 1)) && (Array.isArray(value.data.rows) && (value.data.rows.every((element, index) => (Array.isArray(element) && (element.every((element, index) => ((((typeof element === "string" || Number.isFinite(element)) || typeof element === "boolean") || element === null) && (!(typeof element === "string") || Guard.IsMaxLength(element, 1000)))) && element.length <= 50))) && value.data.rows.length <= 5000)))))].reduce(((count, result) => (result === true ? ++count : count)), 0) === 1))));

// @ts-ignore
const check_2e887d21691806b7 = ((value) => (typeof value === "string" && (Guard.IsMaxLength(value, 200) && Guard.IsMinLength(value, 1))));

// @ts-ignore
const check_2bc5422166bedac6 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((("type" in value && "ref" in value) && Object.getOwnPropertyNames(value).length === 2) && ((value.type === "element" || value.type === "relationship") && check_2e887d21691806b7(value.ref)))));

// @ts-ignore
const check_2be0722166d5f40e = ((value) => (((typeof value === "object" && value !== null && !(Array.isArray(value))) && (("id" in value && Object.getOwnPropertyNames(value).every((var_2, var_3) => (External[1].test(var_2) || false))) && ((((check_2b8f6221669181b6(value.id) && (value.ref === undefined || (!("ref" in value) || check_2e887d21691806b7(value.ref)))) && (value.label === undefined || (!("label" in value) || check_2b814a2166851b92(value.label)))) && (value.kind === undefined || (!("kind" in value) || check_2baa122166a7c17e(value.kind)))) && (value.set === undefined || (!("set" in value) || check_2b9c7a21669c34da(value.set)))))) && (!((!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "ref" in value)) ? (!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "label" in value) : true)));

// @ts-ignore
const check_2b8f6221669181b6 = ((value) => (typeof value === "string" && (Guard.IsMaxLength(value, 200) && Guard.IsMinLength(value, 1))));

// @ts-ignore
const check_2b814a2166851b92 = ((value) => (typeof value === "string" && Guard.IsMaxLength(value, 500)));

// @ts-ignore
const check_2baa122166a7c17e = ((value) => (typeof value === "string" && (Guard.IsMaxLength(value, 100) && Guard.IsMinLength(value, 1))));

// @ts-ignore
const check_2b9c7a21669c34da = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((Object.getOwnPropertyNames(value).every((var_4, var_5) => (External[2].test(var_4) || false)) && ((value.label === undefined || (!("label" in value) || check_2b814a2166851b92(value.label))) && (value.kind === undefined || (!("kind" in value) || check_2baa122166a7c17e(value.kind))))) && Object.getOwnPropertyNames(value).length >= 1)));

// @ts-ignore
const check_2c320221671b3fe6 = ((value) => (((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((("from" in value && "to" in value) && Object.getOwnPropertyNames(value).every((var_6, var_7) => (External[3].test(var_6) || false))) && (((((check_2b8f6221669181b6(value.from) && check_2b8f6221669181b6(value.to)) && (value.kind === undefined || (!("kind" in value) || check_2baa122166a7c17e(value.kind)))) && (value.ref === undefined || (!("ref" in value) || check_2e887d21691806b7(value.ref)))) && (value.label === undefined || (!("label" in value) || check_2b814a2166851b92(value.label)))) && (value.set === undefined || (!("set" in value) || check_2c2b362167157994(value.set)))))) && (!((!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "ref" in value)) ? (!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "kind" in value) : true)));

// @ts-ignore
const check_2c2b362167157994 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((Object.getOwnPropertyNames(value).every((var_8, var_9) => (External[4].test(var_8) || false)) && ((value.kind === undefined || (!("kind" in value) || check_2baa122166a7c17e(value.kind))) && (value.label === undefined || (!("label" in value) || check_2b814a2166851b92(value.label))))) && Object.getOwnPropertyNames(value).length >= 1)));

// @ts-ignore
const check_2c246a21670fb342 = ((value) => (((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((("from" in value && "to" in value) && Object.getOwnPropertyNames(value).every((var_10, var_11) => (External[5].test(var_10) || false))) && ((((check_2b8f6221669181b6(value.from) && check_2b8f6221669181b6(value.to)) && (value.ref === undefined || (!("ref" in value) || check_2e887d21691806b7(value.ref)))) && (value.label === undefined || (!("label" in value) || check_2b814a2166851b92(value.label)))) && (value.set === undefined || (!("set" in value) || check_2c1e1e21670ac670(value.set)))))) && (!((!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "ref" in value)) ? (!((typeof value === "object" && value !== null && !(Array.isArray(value)))) || "label" in value) : true)));

// @ts-ignore
const check_2c1e1e21670ac670 = ((value) => ((typeof value === "object" && value !== null && !(Array.isArray(value))) && ((Object.getOwnPropertyNames(value).every((var_12, var_13) => (External[6].test(var_12) || false)) && (value.label === undefined || (!("label" in value) || check_2b814a2166851b92(value.label)))) && Object.getOwnPropertyNames(value).length >= 1)));

// @ts-ignore
export function Check(value) { return check_2bc5822166bf4786(value) }

SetExternal({ variables: [
  new RegExp("(^schema$|^kind$|^target$|^removals$|^data$)", ""),
  new RegExp("(^id$|^ref$|^label$|^kind$|^set$)", ""),
  new RegExp("(^label$|^kind$)", ""),
  new RegExp("(^from$|^to$|^kind$|^ref$|^label$|^set$)", ""),
  new RegExp("(^kind$|^label$)", ""),
  new RegExp("(^from$|^to$|^ref$|^label$|^set$)", ""),
  new RegExp("(^label$)", ""),
] })
