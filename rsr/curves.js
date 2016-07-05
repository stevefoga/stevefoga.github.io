var csv_file = ["https://raw.githubusercontent.com/stevefoga/stevefoga.github.io/master/rsr/l8_rsr.csv"];
//console.log(csv_file);

// color palette
//var cols = ["#0a72ff", "#1eff06", "#ff1902", "#2dfefe", "#827c01", "#fe07a6", "#a8879f", "#fcff04", "#c602fe", "#16be61", "#ff9569", "#05b3ff", "#ecffa7", "#3f8670", "#e992ff", "#ffb209", "#e72955", "#83bf02", "#bba67b", "#fe7eb1", "#7570c1", "#85bfd1", "#f97505", "#9f52e9", "#8ffec2", "#dad045", "#b85f60", "#fe4df2", "#75ff6c", "#78a55a", "#ae6a02", "#bebeff", "#ffb3b3", "#a4fe04", "#ffc876", "#c548a7", "#d6492b", "#547da7", "#358b06", "#95caa9", "#07b990", "#feb6e9", "#c9ff76", "#02b708", "#7b7a6e", "#1090fb", "#a46d41", "#09ffa9", "#bb76b7", "#06b5b6", "#df307c", "#9b83fd", "#ff757c", "#0cd9fd", "#bdba61", "#c89d26", "#91df7e", "#108c49", "#7b7d40", "#fdd801"];

// Set the dimensions of the canvas / graph
var margin = {top: 30, right: 20, bottom: 50, left: 50},
    width = 600 - margin.left - margin.right,
    height = 270 - margin.top - margin.bottom;

// set ranges
var x = d3.scale.linear().range([0,width]);
var y = d3.scale.linear().range([height,0]);

// define axes
var xAxis = d3.svg.axis().scale(x)
  .orient("bottom").ticks(5);

var yAxis = d3.svg.axis().scale(y)
  .orient("left").ticks(5);

// define line
var value_line = d3.svg.line()
    
    .x(function(d) {
      return x(d.wu); 
    })
    
    .y(function(d) {
      return y(d.rsr); 
    });
//console.log(value_line);

// initialize svg
var svg = d3.select("body")
  .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", 
              "translate(" + margin.left + "," + margin.top + ")");


// read data from csv
d3.csv(csv_file, function(error,data) {
    if (error) throw error;
  
    data.forEach(function(d) {
      d.rsr = +d.rsr_watts;
      d.wu = +d.wavelength_um;
    });
  
    // Scale the range of the data
    x.domain([0, d3.max(data, function(d) { return d.wu; })]);
    y.domain([0, d3.max(data, function(d) { return d.rsr; })]);
  
    // nest data by band
    var dataNest = d3.nest()
      .key(function(d) {return d.band;})
      .entries(data);
  
    var color = d3.scale.category10();
  
    // loop through each band
    dataNest.forEach(function(d) {
      
      svg.append("path")
        .attr("class", "line")
        .style("stroke", function() {
          return d.color = color(d.key); })
        .attr("d", value_line(d.values));
      });
    


// add axes
svg.append("g")
  .attr("class", "x axis")
  .attr("transform", "translate(0," + height + ")")
  .call(xAxis);
  svg.append("text")
    .attr("text-anchor", "middle")  
    .attr("transform", "translate("+ (width/2) +","+(height+(40))+")")
     .text("Wavelength (um)");

svg.append("g")
    .attr("class", "y axis")
    .call(yAxis);
svg.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", "translate("+ (-40) +","+(height/2)+")rotate(-90)")
    .text("Rel. Spectral Response (Watts)");
}); 
