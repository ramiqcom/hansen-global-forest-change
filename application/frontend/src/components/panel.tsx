import { analysis_hansen } from '@/modules/analysis';
import { Store } from '@/modules/store';
import { bbox } from '@turf/turf';
import { Chart } from 'chart.js/auto';
import { useContext, useEffect, useState } from 'react';
export default function Panel() {
  const { status } = useContext(Store);

  return (
    <div className='float top-right'>
      <div id='panel' className='flexible vertical gap'>
        <div className='title'>Hansen Global Forest Change</div>
        <Analysis />
        <Layers />
        <div
          style={{
            textAlign: 'center',
            color:
              status.type == 'success'
                ? 'lightgreen'
                : status.type == 'failed'
                  ? 'red'
                  : 'lightblue',
          }}
        >
          {status.message}
        </div>

        <div style={{ fontSize: 'smaller' }}>
          <div style={{ fontWeight: 'bold' }}>Source</div> Hansen, M. C., P. V. Potapov, R. Moore,
          M. Hancher, S. A. Turubanova, A. Tyukavina, D. Thau, S. V. Stehman, S. J. Goetz, T. R.
          Loveland, A. Kommareddy, A. Egorov, L. Chini, C. O. Justice, and J. R. G. Townshend. 2013.
          High-Resolution Global Maps of 21st-Century Forest Cover Change. Science 342 (15
          November): 850-53. Data available on-line from:{' '}
          <a
            style={{ color: 'lightskyblue', fontSize: 'smaller' }}
            href='https://glad.earthengine.app/view/global-forest-change.'
          >
            https://glad.earthengine.app/view/global-forest-change.
          </a>
        </div>
      </div>
    </div>
  );
}

function Analysis() {
  const { geojson, setStatus, status } = useContext(Store);
  const [bounds, setBounds] = useState<number[]>();
  const [dataTable, setDataTable] = useState<Record<string, any>[]>();
  const [downloadData, setDownloadData] = useState<string>();
  const chartId = 'chart';

  useEffect(() => {
    if (geojson) {
      setBounds(bbox(geojson));
    }
  }, [geojson]);

  useEffect(() => {
    if (dataTable) {
      // Create downloadlink
      const labels = dataTable.map((dict) => dict.year);
      const values = dataTable.map((dict) => dict.areaHa);
      let csv = labels.map((label, index) => `${label},${values[index]}`).join('\n');
      csv = `year,forest_area\n${csv}`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const dataUrl = URL.createObjectURL(blob);
      setDownloadData(dataUrl);

      // Create chart
      let chart = new Chart(chartId, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Forest area (Ha)',
              data: values,
              backgroundColor: 'green',
            },
          ],
        },
        options: {
          layout: {
            padding: {
              top: 10,
              right: 10,
              bottom: 10,
              left: 10,
            },
          },
          plugins: {
            legend: {
              labels: {
                color: 'gray',
              },
            },
          },
          scales: {
            y: {
              ticks: {
                color: 'gray',
              },
            },
            x: {
              ticks: {
                color: 'gray',
              },
            },
          },
        },
      });

      return () => {
        chart.destroy();
      };
    }
  }, [dataTable]);

  return (
    <div className='section flexible vertical gap'>
      <UploadFile />
      <div className='flexible small-gap wide'>
        <button
          style={{ width: '100%' }}
          disabled={typeof geojson == 'undefined' || status.type == 'process'}
          onClick={async () => {
            try {
              setStatus({ type: 'process', message: 'Calculating data' });
              const data = await analysis_hansen(geojson);
              // const layerUrl = URL.createObjectURL(new Blob([layer], { type: 'image/tif' }));
              setDataTable(data);
              // setDownloadLayer(layerUrl);
              setStatus({ type: 'success', message: 'Data calculated' });
            } catch ({ message }) {
              setStatus({ type: 'failed', message });
            }
          }}
        >
          Run analysis
        </button>
        {bounds ? (
          <a
            href={`/download?bounds=${bounds.join(',')}`}
            download='forest_years.tif'
            style={{ width: '100%' }}
          >
            <button
              disabled={typeof bounds == 'undefined' || status.type == 'process'}
              style={{ width: '100%' }}
              onClick={async () => {
                setStatus({ message: 'Preparing layer to download', type: 'process' });
                await new Promise((resolve, reject) => setTimeout(() => resolve(0), 1e4));
                setStatus({ message: 'Downloading layer', type: 'success' });
              }}
            >
              Download layer
            </button>
          </a>
        ) : null}
      </div>
      {dataTable ? (
        <div className='flexible vertical small-gap'>
          <canvas
            id={chartId}
            hidden={typeof dataTable == 'undefined' || status.type == 'process'}
            style={{
              width: '100%',
              height: '20vh',
              backgroundColor: 'white',
            }}
          />
          <a href={downloadData} download='forest_area.csv' style={{ width: '100%' }}>
            <button
              style={{ width: '100%' }}
              disabled={typeof dataTable == 'undefined' || status.type == 'process'}
            >
              Download data
            </button>
          </a>
        </div>
      ) : null}
    </div>
  );
}

function Layers() {
  const { layer, setLayer, year, setYear, layers, minForestCover, setMinForestCover } =
    useContext(Store);
  const selectLayers = layers.map((dict, key) => (
    <button
      disabled={layer.value == dict.value}
      key={key}
      onClick={() => setLayer(dict)}
      className='button-select'
    >
      {dict.label}
    </button>
  ));
  const [tempYear, setTempYear] = useState(year);
  const yearDrag = (
    <div className='flexible vertical'>
      <input
        disabled={layer.value == 'lossyear'}
        type='range'
        min={2000}
        max={2024}
        value={tempYear}
        onMouseUp={() => setYear(tempYear)}
        onChange={(e) => setTempYear(Number(e.target.value))}
      />
      <div className='flexible wide'>
        <div>2000</div>
        <div
          className='flexible center2 center1 center3'
          style={{
            border: 'thin solid white',
            width: '10vh',
            height: '3vh',
            textAlign: 'center',
          }}
        >
          Year: {year}
        </div>
        <div>2024</div>
      </div>
    </div>
  );

  const [tempForestCover, setTempForestCover] = useState(minForestCover);
  const forestCoverDrag = (
    <div className='flexible wide center1'>
      Minimum tree density
      <div className='flexible vertical' style={{ width: '100%' }}>
        <input
          disabled={layer.value != 'forest_cover'}
          type='range'
          min={1}
          max={99}
          value={tempForestCover}
          onMouseUp={() => setMinForestCover(tempForestCover)}
          onChange={(e) => setTempForestCover(Number(e.target.value))}
        />
        <div className='flexible wide'>
          <div>1</div>
          <div>99</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className='flexible vertical small-gap section'>
      Select layer to show to the map
      <div className='flexible wide'>{selectLayers}</div>
      {layer.value != 'lossyear' ? yearDrag : null}
      {layer.value == 'forest_cover' ? forestCoverDrag : null}
      <Legend />
    </div>
  );
}

// Legend
function Legend() {
  const { layer } = useContext(Store);
  const { min, max, palette, label, value } = layer;

  let legend: JSX.Element;
  if (value != 'forest_cover') {
    legend = (
      <div className='flexible vertical'>
        <div
          style={{
            width: '100%',
            height: '2vh',
            backgroundImage: `linear-gradient(to right, ${palette.join(', ')})`,
            border: 'thin solid white',
          }}
        />
        <div className='flexible wide'>
          <div>{value == 'lossyear' ? min + 2000 : min}</div>
          <div>{value == 'lossyear' ? `${label} year` : label}</div>
          <div>{value == 'lossyear' ? max + 2000 : max}</div>
        </div>
      </div>
    );
  } else {
    legend = (
      <div className='flexible gap center1'>
        <div
          style={{
            width: '5vh',
            height: '2vh',
            backgroundColor: palette[0],
            border: 'thin solid white',
          }}
        />
        {label}
      </div>
    );
  }

  return legend;
}

function UploadFile() {
  const { setGeojson, setStatus, status } = useContext(Store);

  return (
    <div className='flexible vertical small-gap'>
      Upload your region of interest in geojson format for analysis or download the layer
      <input
        type='file'
        accept='.geojson,.json'
        disabled={status.type == 'process'}
        onChange={async (e) => {
          // Parse geojson from uploaded file
          try {
            setStatus({ message: 'Loading GeoJSON file...', type: 'process' });
            const file = e.target.files[0];

            const geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }> = JSON.parse(
              await file.text(),
            );

            setGeojson(geojson);
            setStatus({ message: 'GeoJSON loaded', type: 'success' });
          } catch ({ message }) {
            setStatus({ message, type: 'failed' });
          }
        }}
      />
    </div>
  );
}
