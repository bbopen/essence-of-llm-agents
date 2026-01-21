/**
 * Pattern 3.3: Tool Validation
 *
 * Validate all tool inputs against strict schemas. Return errors as
 * results (don't throw) so the LLM can retry.
 *
 * Derived from: Type systems, production reliability requirements
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

// Simple schema validation (in production, use Zod or similar)
interface Schema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: RegExp;
  properties?: Record<string, Schema>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Validate a value against a schema
function validate(value: unknown, schema: Schema, path: string = ''): ValidationResult {
  const errors: string[] = [];

  // Type check
  const actualType = Array.isArray(value) ? 'array' : typeof value;
  if (actualType !== schema.type) {
    errors.push(`${path}: expected ${schema.type}, got ${actualType}`);
    return { valid: false, errors };
  }

  // String validations
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(`${path}: minimum length is ${schema.minLength}`);
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      errors.push(`${path}: maximum length is ${schema.maxLength}`);
    }
    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push(`${path}: does not match required pattern`);
    }
  }

  // Number validations
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: minimum value is ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: maximum value is ${schema.maximum}`);
    }
  }

  // Object validations
  if (schema.type === 'object' && schema.properties && typeof value === 'object' && value !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propValue = (value as Record<string, unknown>)[key];
      if (propValue === undefined) {
        if (propSchema.required) {
          errors.push(`${path}.${key}: required field is missing`);
        }
      } else {
        const propResult = validate(propValue, propSchema, `${path}.${key}`);
        errors.push(...propResult.errors);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Tool with validation
interface ValidatedTool {
  name: string;
  description: string;
  inputSchema: Record<string, Schema>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// Wrap tool execution with validation
async function executeWithValidation(
  tool: ValidatedTool,
  args: Record<string, unknown>
): Promise<string> {
  // Validate each argument
  const allErrors: string[] = [];

  for (const [key, schema] of Object.entries(tool.inputSchema)) {
    const value = args[key];
    if (value === undefined && schema.required) {
      allErrors.push(`${key}: required argument is missing`);
    } else if (value !== undefined) {
      const result = validate(value, schema, key);
      allErrors.push(...result.errors);
    }
  }

  // Return errors as result (don't throw) so LLM can retry
  if (allErrors.length > 0) {
    return `Validation failed:\n${allErrors.join('\n')}\n\nPlease fix these issues and try again.`;
  }

  // Execute if validation passes
  return tool.execute(args);
}

// Example: Validated file write tool
const writeFileTool: ValidatedTool = {
  name: 'write_file',
  description: 'Write content to a file',
  inputSchema: {
    path: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 255,
      pattern: /^[a-zA-Z0-9_\-./]+$/  // Safe path characters only
    },
    content: {
      type: 'string',
      required: true,
      maxLength: 1000000  // 1MB limit
    }
  },
  execute: async (args) => {
    // Actual file write would happen here
    return `Successfully wrote ${(args.content as string).length} bytes to ${args.path}`;
  }
};

export {
  validate,
  executeWithValidation,
  writeFileTool,
  Schema,
  ValidationResult,
  ValidatedTool
};
