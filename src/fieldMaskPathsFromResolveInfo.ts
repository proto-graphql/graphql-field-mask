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

export type GetFieldNameFunc = (
  field: GraphQLField<any, any>,
  type: GraphQLObjectType,
  schema: GraphQLSchema
) => string | null;

export type GetAbstractTypeFieldMaskPathsFunc = (
  info: {
    node: InlineFragmentNode | FragmentDefinitionNode;
    abstractType: GraphQLAbstractType;
    concreteType: GraphQLObjectType;
    field: GraphQLField<any, any>;
  },
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
};

/**
 * Create field mask paths from `GraphQLResolveInfo`.
 *
 * @param typename Name of GraphQL object type
 * @param info
 * @param opts
 * @returns field mask paths
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
        const fieldName = opts.getFieldName ? opts.getFieldName(field, type, schema) : field.name;
        if (fieldName == null) {
          break;
        }
        if (selection.selectionSet) {
          const childTypename = getNamedType(field.type).name;
          const childFields = extractFieldsFromGraphqlAst(childTypename, field, selection, fragments, schema, opts);
          fields.push(...childFields.map((field) => `${fieldName}.${field}`));
        } else {
          fields.push(fieldName);
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
              { node, field, abstractType: currentNodeType, concreteType: getObjectType(fragmentTypename, schema) },
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
