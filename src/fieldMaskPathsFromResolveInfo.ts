import {
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  GraphQLField,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  InlineFragmentNode,
} from "graphql";

export type GetFieldNameFunc = (
  field: GraphQLField<any, any>,
  type: GraphQLObjectType,
  schema: GraphQLSchema
) => string | null;

export type FieldMaskPathsFromResolveInfoOptions = {
  /**
   * Get field name in field mask path.
   * If return `null`, this field is not included in field mask paths.
   */
  getFieldName?: GetFieldNameFunc;
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
    for (const path of extractFieldsFromGraphqlAst(typename, node, fragments, schema, opts)) {
      pathSet.add(path);
    }
  }

  return [...pathSet];
}

function extractFieldsFromGraphqlAst(
  typename: string,
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
          const childFields = extractFieldsFromGraphqlAst(childTypename, selection, fragments, schema, opts);
          fields.push(...childFields.map((field) => `${fieldName}.${field}`));
        } else {
          fields.push(fieldName);
        }
        break;
      }
      case "FragmentSpread": {
        const fragmentName = selection.name.value;
        const fragment = fragments[fragmentName];
        if (fragment == null) {
          throw new Error(`Fragment ${fragmentName} is not found`);
        }
        const childTypename = fragment.typeCondition.name.value;
        const childFields = extractFieldsFromGraphqlAst(childTypename, fragment, fragments, schema, opts);
        fields.push(...childFields);
        break;
      }
      case "InlineFragment": {
        const childTypename = selection.typeCondition ? selection.typeCondition.name.value : typename;
        const childFields = extractFieldsFromGraphqlAst(childTypename, selection, fragments, schema, opts);
        fields.push(...childFields);
        break;
      }
    }
  }
  return fields;
}

function getObjectType(name: string, schema: GraphQLSchema): GraphQLObjectType {
  const foundType = schema.getType(name);
  if (foundType == null) {
    throw new Error(`${name} type is not found`);
  }
  if (!(foundType instanceof GraphQLObjectType)) {
    throw new Error(`${name} is ${foundType.astNode?.kind}, but want ObjectType`);
  }
  return foundType;
}
