/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;

import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;

import { VisualSettings } from "./settings";
import { Chart } from "chart.js";
export class Visual implements IVisual {
    private target: HTMLElement;
    private updateCount: number;
    private settings: VisualSettings;
    private textNode: Text;
    private visualSettings: VisualSettings;

    private columnIndices: { "name": string, "index": number, "label": string, "type": string}[] = [
        { "name": "activity", "index": 0, "label": "Activity" , "type": "string"},
        { "name": "planDate", "index": 0, "label": "Plan Date", "type": "date"},
        { "name": "realDate", "index": 0, "label": "Real Date", "type": "date"}
    ];


    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.updateCount = 0;
        if (document) {
            const chartTag: HTMLElement = document.createElement("div");
            chartTag.setAttribute("id", "chart");
            this.target.appendChild(chartTag);
        }
    }

    private dataExtraction(dataView : DataView) {
        let columns = dataView.table.columns;
        let rows = dataView.table.rows;
        let incommingData = [];
        for (let i = 0; i < this.columnIndices.length; i++) {
            //defining name value from our preconstructed map of names
            let name = this.columnIndices[i].name;
            //now iterate over available columns, note that not all columns may be assigned a data field yet
            for (let j = 0; j < columns.length; j++) {
                //defining the role attribute of the current column, more info in the data view appendix
                let columnRoles = columns[j].roles;
                //column name is the property name, so looking in there
                if (Object.keys(columnRoles).indexOf(name) >= 0) {
                    //setting the index of the column name to the index of the role
                    this.columnIndices[i].index = j;
                    break;
                }
            }
            if(this.columnIndices[i].type === "date") {
                incommingData[name] = rows.map(row => row[this.columnIndices[i].index] ? new Date(row[this.columnIndices[i].index].toString()) : null);
            }
            else {
                incommingData[name] = rows.map(row => row[this.columnIndices[i].index]);
            }
        }
        let min = incommingData["planDate"].reduce((a, b) => a === null ? b : b === null ? a : a < b ? a : b);
        min.setDate(min.getDate() + 5 - min.getDay()) // first Friday
        let maxPlan = incommingData["planDate"].reduce((a, b) => a === null ? b : b === null ? a : a < b ? b : a);
        let maxReal = incommingData["realDate"].reduce((a, b) => a === null ? b : b === null ? a : a < b ? b : a);
        
        let max = maxPlan > maxReal ? maxPlan : maxReal; // last date
        max.setDate(max.getDate() + 5 - max.getDay() + 7) // last Friday

        const interval = 7 * Math.ceil((max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24) / 700);
        const intervals = Math.ceil((max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24) / interval);
        
        if(!intervals) {
            return [];
        }

        let tempDate = min;
        const today = new Date();
        let data = [];
        data["date"] = [];
        data["% Plan"] = [];
        data["% Real"] = [];
        const total = incommingData["activity"].length;
        while(tempDate <= max) {
            let countPlan = 0;
            let countReal = 0;
            for(let i = 0; i < total; i++) {
                if(incommingData["planDate"][i] && incommingData["planDate"][i].getTime() <= tempDate.getTime()) {
                    countPlan++;
                }
                if(incommingData["realDate"][i] && incommingData["realDate"][i].getTime() <= tempDate.getTime() && incommingData["realDate"][i].getTime() <= today.getTime()) {
                    countReal++;
                }
            }
            data["date"].push(tempDate.toISOString().substring(0, 10));
            data["% Plan"].push(countPlan / total * 100);
            data["% Real"].push(tempDate.getTime() <= today.getTime() ? countReal / total * 100 : null);

            tempDate.setDate(tempDate.getDate() + interval);
        }

        return data;
    }

    public update(options: VisualUpdateOptions) {

        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        this.visualSettings = VisualSettings.parse<VisualSettings>(options.dataViews[0]);
        let data = [];
        if (options.dataViews.length > 0) {
            data = this.dataExtraction(options.dataViews[0]);
        } else {
            return;
        }
        let ChartJS = (<any>window).Chart;

        // recreating canvas every time the data changes
        let canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
        if (canvas) {
            canvas.remove();
        }
        canvas = document.createElement("canvas");
        canvas.setAttribute("id", "canvas");
        
        let chartTag = document.getElementById("chart") as HTMLElement | null;
        chartTag.appendChild(canvas);

        let ctx = canvas?.getContext("2d");
        Chart.defaults.color = this.visualSettings.line.fontColor;
        let chart = new ChartJS(
            "canvas",
            {
                type: 'line',
                data: {
                    labels: data['date'],
                    datasets: [{
                        label: "% Plan",
                        data: data['% Plan'],
                        fill: false,
                        borderColor: this.visualSettings.line.planColor,
                    },
                    {
                        label: "% Real",
                        data: data['% Real'],
                        fill: false,
                        borderColor: this.visualSettings.line.realColor,
                    }]
                },
                options: {
                    responsive: true,
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
                    scales: {
                        x: {
                          ticks: {
                            color: this.visualSettings.line.fontColor,
                            font: {
                                size: this.visualSettings.line.fontSize
                            }
                          }
                        },
                        y: {
                          ticks: {
                            color: this.visualSettings.line.fontColor,
                            font: {
                                size: this.visualSettings.line.fontSize
                            }
                          }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: this.visualSettings.line.fontColor,
                                font: {
                                    size: this.visualSettings.line.fontSize
                                }
                            }
                        }
                    }
                }
            }
        )
    }

    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }
    
}