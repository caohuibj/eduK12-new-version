export type FormBulkLine={label:string;code?:string}

/** A line is an item. Commas and equals signs are content; TSV needs explicit code mode. */
export function parseFormBulkLines(text:string,coded=false):FormBulkLine[]{
  return text.replace(/\r\n?/g,'\n').split('\n').filter(line=>line.trim()).map(line=>{
    const cells=line.split('\t')
    if(coded?cells.length!==2:cells.length!==1){
      throw new Error(coded?'请粘贴两列：第一列编码，第二列文字。':'检测到多列内容。请只复制一列文字。')
    }
    const label=(coded?cells[1]:line).trim()
    if(!label)throw new Error('每一项都需要填写文字。')
    return coded?{label,code:cells[0].trim()}:{label}
  })
}
