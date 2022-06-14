import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;
export declare class VisualSettings extends DataViewObjectsParser {
    line: lineSettings;
}
export declare class lineSettings {
    planColor: string;
    realColor: string;
    fontColor: string;
    fontSize: number;
}
