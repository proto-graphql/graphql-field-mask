import {
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  GraphQLAbstractType,
  GraphQLField,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  InlineFragmentNode,
  isAbstractType,
} from "graphql";

type FieldInfo = {
  fieldNode: FieldNode;
  field: GraphQLField<any, any>;
  objectType: GraphQLObjectType;
  schema: GraphQLSchema;
};

type AbstractFieldInfo = {
  fragmentNode: InlineFragmentNode | FragmentDefinitionNode;
  abstractType: GraphQLAbstractType;
  concreteType: GraphQLObjectType;
  field: GraphQLField<any, any>;
  schema: GraphQLSchema;
};

export type AddExtraFieldsFunc = (info: FieldInfo) => string[];
export type GetFieldNameFunc = (info: FieldInfo) => string | string[] | null;

export type GetAbstractTypeFieldMaskPathsFunc = (
  info: AbstractFieldInfo,
  getFieldMaskPaths: () => string[]
) => string[];

export type FieldMaskPathsFromResolveInfoOptions = {
  /**
   * Get field name in field mask path.
   * If return `null`, this field is not included in field mask paths.
   */
  getFieldName?: GetFieldNameFunc;
  /**
   * Determine field mask paths in abstract type.
   * By default, it returns only the fields of the abstract type itself and ignores fragments of concrete types,
   * but you can change this behavior by defining `getAbstractTypeFieldMaskPaths`.
   */
  getAbstractTypeFieldMaskPaths?: GetAbstractTypeFieldMaskPathsFunc;
  /**
   * Return additional fields, such as fields that are dependent in a resolver.
   */
  addExtraFields?: AddExtraFieldsFunc;
};

/**
 * Create field mask paths from `GraphQLResolveInfo`.
 *
 * @param typename Name of GraphQL object type
 * @param info
 * @param opts
 * @returns field mask paths
 *
 * @example
 * ```ts
 * import { FieldMask } from "google-protobuf/google/protobuf/field_mask_pb";
 * import { fieldMaskPathsFromResolveInfo } from "graphql-field-mask";
 *
 * const queryType = new GraphQLObjectType({
 *   name: "Query",
 *   fields: {
 *     viewer: {
 *       type: User,
 *       resolve(_source, _args, ctx, info) {
 *         const paths = fieldMaskPathsFromResolveInfo("User", info);
 *         const mask = new FieldMask().setPathsList(paths);
 *
 *         // ...
 *       }
 *     }
 *   }
 * })
 * ```
 *
 * ### Convert to snake case
 * ```ts
 * import { snakeCase } from "change-case";
 * import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "graphql-field-mask";
 *
 * const getFieldName: GetFieldNameFunc = ({ field }) => snakeCase(field.name);
 *
 * resolve(_source, _args, ctx, info) {
 *   const paths = fieldMaskPathsFromResolveInfo("User", info, { getFieldName });
 *   const mask = new FieldMask().setPathsList(paths);
 *
 *   // ...
 * }
 * ```
 *
 * ### With custom scalar
 * ```ts
 * import { getNamedType, isScalarType } from "graphql";
 * import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "graphql-field-mask";
 *
 * const getFieldName: GetFieldNameFunc = ({ field }) => {
 *   const fieldType = getNamedType(field.type);
 *   if (isScalarType(fieldType)) {
 *     switch (fieldType.name) {
 *     case 'Date':
 *       return ['year', 'month', 'day'].map(c => `${fieldName}.${c}`);
 *     // ...
 *     }
 *   }
 *   return field.name
 * };
 *
 * resolve(_source, _args, ctx, info) {
 *   const paths = fieldMaskPathsFromResolveInfo("User", info, { getCustomScalarFieldMaskPaths });
 *   const mask = new FieldMask().setPathsList(paths);
 *
 *   // ...
 * }
 * ```
 *
 * ### With extra fields
 *
 * ```ts
 * import { fieldMaskPathsFromResolveInfo, AddExtraFieldsFunc } from "graphql-field-mask";
 *
 * const addExtraFields: AddExtraFieldsFunc = ({ field }) => {
 *   return (field.extension as { dependentFields?: string[] }).dependentFields ?? []
 * };
 *
 * resolve(_source, _args, ctx, info) {
 *   const paths = fieldMaskPathsFromResolveInfo("User", info, { addExtraFields });
 *   const mask = new FieldMask().setPathsList(paths);
 *   // ...
 * }
 * ```
 *
 * ### With [ProtoNexus](https://github.com/proto-graphql/proto-nexus)
 * ```ts
 * import { ProtobufFieldExtensions, ProtobufMessageExtensions, ProtobufOneofExtensions } from "proto-nexus";
 * import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "graphql-field-mask";
 *
 * const getFieldName: GetFieldNameFunc = ({ field }) => {
 *   const ext = (field.extensions ?? {}) as Partial<ProtobufFieldExtensions>;
 *   return ext.protobufField?.name  ?? null;
 * };
 *
 * const getAbstractTypeFieldMaskPaths: GetAbstractTypeFieldMaskPathsFunc = (info, getFieldMaskPaths) => {
 *   const oneofExt = (info.abstractType.extensions ?? {}) as Partial<ProtobufOneofExtensions>;
 *   const objExt = (info.concreteType.extensions ?? {}) as Partial<ProtobufMessageExtensions>;
 *   const prefix = (oneofExt.protobufOneof.fields ?? []).find(f => f.type === objExt.protobufMessage?.fullName)?.name;
 *   return prefix ? getFieldMaskPaths().map(p => `${prefix}.${p}`) : []
 * }
 *
 * resolve(_source, _args, ctx, info) {
 *   const paths = fieldMaskPathsFromResolveInfo("User", info, { getFieldName, getAbstractTypeFieldMaskPaths });
 *   const mask = new FieldMask().setPathsList(paths);
 *   // ...
 * }
 * ```
 */
export function fieldMaskPathsFromResolveInfo(
  typename: string,
  info: GraphQLResolveInfo,
  opts: FieldMaskPathsFromResolveInfoOptions = {}
) {
  return fieldMaskPaths(typename, info.fieldNodes, info.fragments, info.schema, opts);
}

function fieldMaskPaths(
  typename: string,
  nodes: ReadonlyArray<FieldNode>,
  fragments: GraphQLResolveInfo["fragments"],
  schema: GraphQLSchema,
  opts: FieldMaskPathsFromResolveInfoOptions
): string[] {
  const pathSet = new Set<string>();

  for (const node of nodes) {
    for (const path of extractFieldsFromGraphqlAst(typename, null, node, fragments, schema, opts)) {
      pathSet.add(path);
    }
  }

  return [...pathSet];
}

function extractFieldsFromGraphqlAst(
  typename: string,
  field: GraphQLField<any, any> | null,
  node: FieldNode | FragmentDefinitionNode | InlineFragmentNode,
  fragments: GraphQLResolveInfo["fragments"],
  schema: GraphQLSchema,
  opts: FieldMaskPathsFromResolveInfoOptions
): string[] {
  if (!node.selectionSet) {
    return [];
  }

  const fields: string[] = [];

  for (const selection of node.selectionSet.selections) {
    switch (selection.kind) {
      case "Field": {
        if (selection.name.value === "__typename") break;

        const type = getObjectType(typename, schema);
        const field = type.getFields()[selection.name.value];
        if (field == null) {
          throw new Error(`${typename}.${selection.name.value} is not found`);
        }
        if (opts.addExtraFields) {
          const extraFields = opts.addExtraFields({ fieldNode: selection, field, objectType: type, schema });
          fields.push(...extraFields);
        }
        const fieldNameOrFieldNames = opts.getFieldName
          ? opts.getFieldName({ fieldNode: selection, field, objectType: type, schema })
          : field.name;
        if (fieldNameOrFieldNames == null) {
          break;
        }
        const fieldNames = Array.isArray(fieldNameOrFieldNames) ? fieldNameOrFieldNames : [fieldNameOrFieldNames];
        if (selection.selectionSet) {
          const childTypename = getNamedType(field.type).name;
          const childFields = extractFieldsFromGraphqlAst(childTypename, field, selection, fragments, schema, opts);
          fields.push(...childFields.flatMap((field) => fieldNames.map((fieldName) => `${fieldName}.${field}`)));
        } else {
          fields.push(...fieldNames);
        }
        break;
      }
      case "FragmentSpread":
      case "InlineFragment": {
        let fragmentTypename: string;
        let node: FragmentDefinitionNode | InlineFragmentNode;
        switch (selection.kind) {
          case "FragmentSpread": {
            const fragmentName = selection.name.value;
            const fragment = fragments[fragmentName];
            if (fragment == null) {
              throw new Error(`Fragment ${fragmentName} is not found`);
            }
            fragmentTypename = fragment.typeCondition.name.value;
            node = fragment;
            break;
          }
          case "InlineFragment": {
            fragmentTypename = selection.typeCondition ? selection.typeCondition.name.value : typename;
            node = selection;
            break;
          }
          default: {
            throw new Error("unreachable");
          }
        }
        const fragmentType = getType(fragmentTypename, schema);
        const currentNodeType = getType(typename, schema);
        if (isAbstractType(currentNodeType)) {
          if (typename === fragmentTypename) {
            const childFields = extractFieldsFromGraphqlAst(typename, field, node, fragments, schema, opts);
            fields.push(...childFields);
          } else if (opts.getAbstractTypeFieldMaskPaths) {
            if (field == null) {
              throw new Error("field is expected to be present. please report issue.");
            }
            const paths = opts.getAbstractTypeFieldMaskPaths(
              {
                fragmentNode: node,
                abstractType: currentNodeType,
                concreteType: getObjectType(fragmentTypename, schema),
                field,
                schema,
              },
              () => {
                return extractFieldsFromGraphqlAst(fragmentTypename, field, node, fragments, schema, opts);
              }
            );
            fields.push(...paths);
          } else {
            // ignore union types if `getUnionFieldMaskPath` is not passed
          }
        } else if (!isAbstractType(fragmentType) && fragmentTypename !== typename) {
          // no-op
        } else {
          const childFields = extractFieldsFromGraphqlAst(typename, field, node, fragments, schema, opts);
          fields.push(...childFields);
        }
        break;
      }
    }
  }
  return fields;
}

function getType(name: string, schema: GraphQLSchema): GraphQLNamedType {
  const foundType = schema.getType(name);
  if (foundType == null) {
    throw new Error(`${name} type is not found`);
  }
  return foundType;
}

function getObjectType(name: string, schema: GraphQLSchema): GraphQLObjectType {
  const foundType = getType(name, schema);
  if (!(foundType instanceof GraphQLObjectType)) {
    throw new Error(`${name} is ${foundType.astNode?.kind}, but want ObjectType`);
  }
  return foundType;
}
