import { argv } from 'yargs';
import { inquirer } from './external';
import { commands } from './commands';

type FlagType = 'string' | 'number' | 'boolean';

interface Flag {
  name: string;
  type?: FlagType;
  values?: Array<any>;
  describe?: string;
  default?: any;
  required?: boolean;
}

function getCommandData(retrieve: any) {
  const instructions: Array<Flag> = [];
  const fn = {
    positional(name: string, info: Flag) {
      instructions.push({
        ...info,
        name,
      });
      return this;
    },
    swap(name: string, swapper: (flag: Flag) => Flag) {
      const [flag] = instructions.filter((m) => m.name === name);
      const newFlag = swapper(flag || { name });

      if (!flag) {
        instructions.push(newFlag);
      } else {
        Object.assign(flag, newFlag);
      }

      return this;
    },
    choices(name: string, choices: Array<any>) {
      return this.swap(name, (flag) => ({
        ...flag,
        type: 'string',
        values: choices,
      }));
    },
    string(name: string) {
      return this.swap(name, (flag) => ({
        ...flag,
        type: 'string',
      }));
    },
    boolean(name: string) {
      return this.swap(name, (flag) => ({
        ...flag,
        type: 'boolean',
      }));
    },
    describe(name: string, value: string) {
      return this.swap(name, (flag) => ({
        ...flag,
        describe: value,
      }));
    },
    default(name: string, value: any) {
      return this.swap(name, (flag) => ({
        ...flag,
        default: value,
      }));
    },
    number(name: string) {
      return this.swap(name, (flag) => ({
        ...flag,
        type: 'number',
      }));
    },
    demandOption(name: string) {
      return this.swap(name, (flag) => ({
        ...flag,
        required: true,
      }));
    },
  };

  if (typeof retrieve === 'function') {
    retrieve(fn);
  }

  return instructions;
}

function getValue(type: FlagType, value: string) {
  switch (type) {
    case 'boolean':
      return !!value;
    case 'number':
      return +value;
    case 'string':
      return value;
  }
}

function getType(flag: Flag) {
  switch (flag.type) {
    case 'string':
      if (flag.values) {
        return 'list';
      }

      return 'input';
    case 'number':
      return 'input';
    case 'boolean':
      return 'confirm';
  }
}

export function runQuestionnaire(commandName: string, ignoredInstructions = ['base', 'log-level']) {
  const [command] = commands.all.filter((m) => m.name === commandName);
  const acceptAll = argv.y === true;
  const instructions = getCommandData(command.flags);
  const questions = instructions
    .filter((instruction) => !ignoredInstructions.includes(instruction.name))
    .filter((instruction) => !acceptAll || (instruction.default === undefined && instruction.required))
    .filter((instruction) => argv[instruction.name] === undefined)
    .map((instruction) => ({
      name: instruction.name,
      default: instruction.values ? instruction.values.indexOf(instruction.default) : instruction.default,
      message: instruction.describe,
      type: getType(instruction),
      choices: instruction.values,
      validate: instruction.type === 'number' ? (input: string) => !isNaN(+input) : () => true,
    }));

  return inquirer.prompt(questions).then((answers) => {
    const parameters: any = {};

    for (const instruction of instructions) {
      const value = answers[instruction.name] ?? argv[instruction.name];
      parameters[instruction.name] =
        value !== undefined ? getValue(instruction.type, value as any) : instruction.default;
    }

    return command.run(parameters);
  });
}
