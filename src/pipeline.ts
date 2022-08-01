import * as readline from 'readline';

enum ArrayLogicalBehavior {
    AND, OR
}

class PipelineElement {
    value: number | PipelineElement[];

    constructor(value: number | PipelineElement[]) {
        this.value = value;
    }

    getFlatValues(): number[] {
        if (!Array.isArray(this.value)) return [this.value];
        const flatValues: number[] = [];
        this.value.forEach((element: PipelineElement) => {
            flatValues.push(...element.getFlatValues());
        });

        return flatValues;
    }
}

type BuildingBlock = (el: PipelineElement) => PipelineElement | null;

function filter(predicate: (value: number) => boolean,
    arrayLogicalBehavior: ArrayLogicalBehavior = ArrayLogicalBehavior.AND): BuildingBlock {
    function doesPassFilter(element: PipelineElement, predicate: (value: number) => boolean): boolean {
        if (!Array.isArray(element.value)) return predicate(element.value);

        // array policy is flattening- either return logical OR of entire window or logical AND (default)
        if (arrayLogicalBehavior === ArrayLogicalBehavior.AND) {
            return element.value.reduce((aggregator: boolean, inner: PipelineElement) => {
                return aggregator && doesPassFilter(inner, predicate);
            }, true);
        } else {
            return element.value.reduce((aggregator: boolean, inner: PipelineElement) => {
                return aggregator || doesPassFilter(inner, predicate);
            }, false);
        }
    }

    return (element: PipelineElement) => {
        return doesPassFilter(element, predicate) ? element : null;
    };
}

function fixedEventWindow(size: number): BuildingBlock {
    let eventBuffer: (PipelineElement)[] = [];
    return (element: PipelineElement) => {
        if (eventBuffer.length == size) eventBuffer = [];
        eventBuffer.push(element);
        return (eventBuffer.length == size) ? new PipelineElement(eventBuffer) : null;
    };
}

function foldSum(): BuildingBlock {
    function getSumOfValues(element: PipelineElement): number {
        if (!Array.isArray(element.value)) return element.value;

        // array policy is flattening- return sum of entire event window
        return element.value.reduce((aggregator: number, element: PipelineElement) => {
            return aggregator + getSumOfValues(element);
        }, 0);
    }

    return (element: PipelineElement) => {
        return new PipelineElement(getSumOfValues(element));
    }
}

function foldMedian(): BuildingBlock {
    function getMedianOfValues(element: PipelineElement): number {
        if (!Array.isArray(element.value)) return element.value;

        // array policy is flattening- return median of entire event window
        const values: number[] = element.getFlatValues();
        values.sort((x: number, y: number) => { return x - y; });
        const n = values.length;
        return (n % 2 == 0) ? 0.5 * (values[n / 2] + values[(n / 2) - 1]) : values[(n - 1) / 2];
    }

    return (element: PipelineElement) => {
        return new PipelineElement(getMedianOfValues(element));
    };
}

function stdoutProcessor(): BuildingBlock {
    function getValueAsString(element: PipelineElement): string {
        if (!Array.isArray(element.value)) return element.value.toString();

        const substrings: string[] = [];
        element.value.forEach(inner => {
            substrings.push(getValueAsString(inner));
        });

        return '[' + substrings.join(', ') + ']';
    }

    return (element: PipelineElement) => {
        console.log(getValueAsString(element));
        return element;
    };
}

function stdinSource(functions: BuildingBlock[]): void {
    function promptUserInput(rl: readline.Interface) {
        rl.setPrompt('> ');
        rl.prompt();
    }

    const rl = readline.createInterface(process.stdin, process.stdout);
    promptUserInput(rl);
    rl.on('line', (line: string) => {
        let parsedInput: number;
        try {
            parsedInput = getValidInputNumber(line);
        } catch (err: any) {
            console.log(err.message);
            return;
        }

        let element: PipelineElement | null = new PipelineElement(parsedInput);
        runBuildingBlocks(element, functions);
        promptUserInput(rl);
    });
}

function getValidInputNumber(line: string) {
    const parsedInput: number = Number(line);
    if (isNaN(parsedInput)) {
        throw new Error('input is not a number');
    }
    return parsedInput;
}

function runBuildingBlocks(element: PipelineElement | null, functions: BuildingBlock[]): void {
    functions.forEach((block: BuildingBlock) => {
        if (!element)
            return;

        try {
            element = block(element);
        } catch (err: any) {
            console.log(err.message)
        }
    });
}

let functions: BuildingBlock[] = [
    filter((i) => { return i > 0; }),
    fixedEventWindow(2),
    foldSum(),
    fixedEventWindow(3),
    foldMedian(),
    stdoutProcessor()
];

stdinSource(functions);
