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
    private today: Date;
    private lastRealDate: Date;
    private todayPlan: number;
    private todayReal: number;
    private lastRealDatePlan: number;
    private lastRealDateReal: number;
    private host: powerbi.extensibility.visual.IVisualHost;

    private columnIndices: { "name": string, "index": number, "label": string, "type": string}[] = [
        { "name": "activity", "index": 0, "label": "Activity" , "type": "string"},
        { "name": "planDate", "index": 0, "label": "Plan Date", "type": "date"},
        { "name": "realDate", "index": 0, "label": "Real Date", "type": "date"}
    ];


    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.today = new Date();
        this.target = options.element;
        if (document) {
            const table: HTMLElement = document.createElement("div");
            table.setAttribute("id", "table");
            this.target.appendChild(table);

            const chartTag: HTMLElement = document.createElement("div");
            chartTag.setAttribute("id", "chart");
            chartTag.style.overflowY = "auto";
            this.target.appendChild(chartTag);
            this.target.style.overflowY = "auto";   
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
                if(incommingData["realDate"][i] && incommingData["realDate"][i].getTime() <= tempDate.getTime() && incommingData["realDate"][i].getTime() <= this.today.getTime()) {
                    countReal++;
                }
            }
            data["date"].push(tempDate.toISOString().substring(0, 10));
            data["% Plan"].push(Math.round((countPlan / total * 100)*1000)/1000);
            data["% Real"].push(tempDate.getTime() <= this.today.getTime() ? Math.round((countReal / total * 100)*1000)/1000 : null);

            tempDate.setDate(tempDate.getDate() + interval);
        }

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        let tempLastRealDate = incommingData["realDate"][0];
        for (let i = 0; i < total; i++) {
            if(tempLastRealDate === null) {
                tempLastRealDate = incommingData["realDate"][i];
            }
            if(incommingData["realDate"][i] && incommingData["realDate"][i].getTime() <= this.today.getTime()) {
                if(tempLastRealDate.getTime() < incommingData["realDate"][i].getTime()) {
                    tempLastRealDate = incommingData["realDate"][i];
                }
            }
        }
        this.lastRealDate = tempLastRealDate;

        let todayCountPlan = 0;
        let todayCountReal = 0;
        let lastRealDateCountPlan = 0;
        let lastRealDateCountReal = 0;
        for(let i = 0; i < total; i++) {
            if(incommingData["planDate"][i]) {
                if(incommingData["planDate"][i].getTime() <= this.today.getTime()) {
                    todayCountPlan++;
                }
                if(incommingData["planDate"][i].getTime() <= this.lastRealDate.getTime()) {
                    lastRealDateCountPlan++;
                }
            }
            if(incommingData["realDate"][i]) {
                if(incommingData["realDate"][i].getTime() <= this.today.getTime()) {
                    todayCountReal++;
                }
                if(incommingData["realDate"][i].getTime() <= this.lastRealDate.getTime()) {
                    lastRealDateCountReal++;
                }
            }
        }
        this.todayPlan = Math.round((todayCountPlan / total * 100)*100)/100;
        this.todayReal = Math.round((todayCountReal / total * 100)*100)/100;
        this.lastRealDatePlan = Math.round((lastRealDateCountPlan / total * 100)*100)/100;
        this.lastRealDateReal = Math.round((lastRealDateCountReal / total * 100)*100)/100;

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        return data;
    }

    public update(options: VisualUpdateOptions) {
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        this.visualSettings = VisualSettings.parse<VisualSettings>(options.dataViews[0]);

        //getting more data from window
        if(options.dataViews[0].metadata.segment) {
            let moreData = this.host.fetchMoreData();
        }

        // recreating canvas every time the data changes
        let table = document.getElementById("table");
        table.innerHTML = '';
        let canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
        if (canvas) {
            canvas.remove();
        }
        canvas = document.createElement("canvas");
        canvas.setAttribute("id", "canvas");
        let chartTag = document.getElementById("chart") as HTMLElement | null;
        chartTag.appendChild(canvas);
        
        let data = [];
        if (options.dataViews.length > 0) {
            data = this.dataExtraction(options.dataViews[0]);
        } else {
            return;
        }
        

        // Heading table
        if(this.visualSettings.line.showTable) {
        table.innerHTML = `
        <table style="margin: 0 auto">
            <thead>
                <tr>
                    <th colspan="4" style="text-align: center">Total: ${options.dataViews[0].table.rows.length}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><b>Today</b></td>
                    <td style="padding-left:2rem">${this.today.toISOString().substring(0,10)}</td>
                    <td style="padding-left:2rem">Plan: ${this.todayPlan}%</td>
                    <td style="padding-left:2rem">Real: ${this.todayReal}%</td>
                </tr>
                <tr>
                    <td><b>Last execution date</b></td>
                    <td style="padding-left:2rem">${this.lastRealDate.toISOString().substring(0,10)}</td>
                    <td style="padding-left:2rem">Plan: ${this.lastRealDatePlan}%</td>
                    <td style="padding-left:2rem">Real: ${this.lastRealDateReal}%</td>
                </tr>
            </tbody>
        </table>
        <br />
        `;
        table.style.color = this.visualSettings.line.fontColor
        table.style.fontSize = this.visualSettings.line.fontSize + "px";
        } else {
            table.innerHTML = "";
        }
        let tableHeight = table.clientHeight;
        ////////////////

        canvas.style.height = (options.viewport.height - tableHeight - 20) + "px";
        let ChartJS = (<any>window).Chart;
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
                    maintainAspectRatio: false,
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